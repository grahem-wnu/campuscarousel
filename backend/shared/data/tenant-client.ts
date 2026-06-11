// Tenant-scoping decorator over the TableClient (SaaS platform — sub-project 1). Prefixes every PK
// and EVERY GSI partition (GSI1..4) with `T#<tenantId>#`, so a query for one family's data physically
// cannot return another's. Applied at the single storage seam, so repos/modules are untouched. Reads
// need no un-prefixing — stripInternal already drops PK/SK/GSIxPK before returning the domain object.
// Fail-closed: currentTenantId() throws if no tenant context is set.

import { currentTenantId } from '../tenant/index.js';
import type { QueryOptions, StoredItem, TableClient } from './table-client.js';

const GSI_PK_ATTRS = ['GSI1PK', 'GSI2PK', 'GSI3PK', 'GSI4PK'] as const;

export function tenantScoped(inner: TableClient): TableClient {
  const prefix = (): string => `T#${currentTenantId()}#`;
  const scope = (pk: string): string => `${prefix()}${pk}`;

  const scopeItem = (item: StoredItem): StoredItem => {
    const p = prefix();
    const out: StoredItem = { ...item, PK: `${p}${item.PK}` };
    for (const attr of GSI_PK_ATTRS) {
      if (out[attr] !== undefined) out[attr] = `${p}${String(out[attr])}`;
    }
    return out;
  };

  // Methods are async so a fail-closed throw from currentTenantId() surfaces as a rejected promise
  // (consistent with the async TableClient contract), not a synchronous throw.
  return {
    get: async (pk: string, sk: string) => inner.get(scope(pk), sk),
    delete: async (pk: string, sk: string) => inner.delete(scope(pk), sk),
    put: async (item: StoredItem) => inner.put(scopeItem(item)),
    query: async (pk: string, opts?: QueryOptions) => inner.query(scope(pk), opts),
    queryIndex: async (index, pk: string, opts?: QueryOptions) => inner.queryIndex(index, scope(pk), opts),
  };
}
