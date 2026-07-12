// Tenant-scoping decorator over the TableClient (SaaS platform — sub-project 1). Prefixes every PK
// and EVERY GSI partition (GSI1..4) with `T#<tenantId>#`, so a query for one family's data physically
// cannot return another's. Applied at the single storage seam, so repos/modules are untouched. Reads
// need no un-prefixing — stripInternal already drops PK/SK/GSIxPK before returning the domain object.
// Fail-closed: currentTenantId() throws if no tenant context is set.

import { currentStudentId, currentTenantId } from '../tenant/index.js';
import type { PutCondition, QueryOptions, StoredItem, TableClient } from './table-client.js';

const GSI_PK_ATTRS = ['GSI1PK', 'GSI2PK', 'GSI3PK', 'GSI4PK'] as const;

/**
 * Decorate a TableClient so every PK and every GSIxPK is prefixed with `prefix()`. Shared by the
 * tenant and student tiers — the only difference is the prefix string and which context throws when
 * unset. Methods are async so a fail-closed throw (from `currentTenantId`/`currentStudentId`)
 * surfaces as a rejected promise (consistent with the async TableClient contract), not a sync throw.
 */
function prefixedClient(inner: TableClient, prefix: () => string): TableClient {
  const scope = (pk: string): string => `${prefix()}${pk}`;
  const scopeItem = (item: StoredItem): StoredItem => {
    const p = prefix();
    const out: StoredItem = { ...item, PK: `${p}${item.PK}` };
    for (const attr of GSI_PK_ATTRS) {
      if (out[attr] !== undefined) out[attr] = `${p}${String(out[attr])}`;
    }
    return out;
  };
  return {
    get: async (pk: string, sk: string) => inner.get(scope(pk), sk),
    delete: async (pk: string, sk: string) => inner.delete(scope(pk), sk),
    put: async (item: StoredItem) => inner.put(scopeItem(item)),
    // condition.attr is a plain attribute (e.g. `status`), never a key, so it needs no prefixing.
    putIf: async (item: StoredItem, condition: PutCondition) => inner.putIf(scopeItem(item), condition),
    query: async (pk: string, opts?: QueryOptions) => inner.query(scope(pk), opts),
    queryIndex: async (index, pk: string, opts?: QueryOptions) => inner.queryIndex(index, scope(pk), opts),
    scanByPkPrefix: async (pkPrefix: string) => inner.scanByPkPrefix(scope(pkPrefix)),
  };
}

/** Tenant tier: prefixes keys with `T#<tenantId>#` so one family's data can't return another's. */
export function tenantScoped(inner: TableClient): TableClient {
  return prefixedClient(inner, () => `T#${currentTenantId()}#`);
}

/**
 * Student tier: prefixes keys with `S#<studentId>#`. Compose as `studentScoped(tenantScoped(base))`
 * so the final key is `T#<tenantId>#S#<studentId>#<originalKey>` — per-child data is isolated within
 * a family exactly as families are isolated from each other. Used only for per-child repos.
 */
export function studentScoped(inner: TableClient): TableClient {
  return prefixedClient(inner, () => `S#${currentStudentId()}#`);
}
