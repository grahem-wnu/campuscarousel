# Tenancy & Data Isolation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every piece of data tenant-isolated so the app can host many families, with a provable two-tenant isolation guarantee, by threading a `tenantId` through the existing `TableClient` seam.

**Architecture:** A `T#<tenantId>#` prefix on every DynamoDB `PK` and all `GSI{1..4}PK`, applied by a single `tenantScoped(TableClient)` decorator. The tenant is carried per-request via `AsyncLocalStorage`, resolved from the JWT `custom:tenantId` claim, and set explicitly by background jobs. Fail-closed: any data access without a tenant context throws. The 22 feature modules are untouched.

**Tech stack:** Node 20 / TypeScript, DynamoDB single-table, Cognito (custom attrs), Vitest, AWS CDK. Spec: `spec/platform/2026-06-10-tenancy-and-data-isolation-design.md`.

**Branch:** `feat/saas-tenancy-foundation` (already cut off `dev`).

---

## Chunk 1: Tenant context (AsyncLocalStorage)

### Task 1: `tenant` context module

**Files:**
- Create: `backend/shared/tenant/context.ts`
- Create: `backend/shared/tenant/index.ts`
- Test: `backend/shared/tenant/context.test.ts`

- [ ] **Step 1: Write the failing test** (`context.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { TenantContextError, currentTenantId, runWithTenant } from './context.js';

describe('tenant context', () => {
  it('returns the tenant set by runWithTenant', async () => {
    const id = await runWithTenant('t1', async () => currentTenantId());
    expect(id).toBe('t1');
  });
  it('throws TenantContextError when no tenant is set (fail closed)', () => {
    expect(() => currentTenantId()).toThrow(TenantContextError);
  });
  it('isolates concurrent contexts', async () => {
    const [a, b] = await Promise.all([
      runWithTenant('A', async () => { await Promise.resolve(); return currentTenantId(); }),
      runWithTenant('B', async () => currentTenantId()),
    ]);
    expect([a, b]).toEqual(['A', 'B']);
  });
  it('survives awaits inside the callback', async () => {
    const id = await runWithTenant('t2', async () => {
      await new Promise((r) => setTimeout(r, 1));
      return currentTenantId();
    });
    expect(id).toBe('t2');
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run backend/shared/tenant` → FAIL (module missing).

- [ ] **Step 3: Implement** (`context.ts`)

```ts
// Per-request tenant context via AsyncLocalStorage. The data layer reads currentTenantId() to scope
// every key; it THROWS when unset so no access is ever un-scoped (fail closed). Background jobs set
// the context explicitly with runWithTenant.
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore { tenantId: string; }
const als = new AsyncLocalStorage<TenantStore>();

export class TenantContextError extends Error {
  constructor() {
    super('No tenant in context — data access requires a tenant (fail closed).');
    this.name = 'TenantContextError';
  }
}

export function runWithTenant<T>(tenantId: string, fn: () => Promise<T> | T): Promise<T> | T {
  if (!tenantId) throw new TenantContextError();
  return als.run({ tenantId }, fn);
}

export function currentTenantId(): string {
  const store = als.getStore();
  if (!store?.tenantId) throw new TenantContextError();
  return store.tenantId;
}

export function maybeTenantId(): string | undefined {
  return als.getStore()?.tenantId;
}
```

And `index.ts`:
```ts
export { runWithTenant, currentTenantId, maybeTenantId, TenantContextError } from './context.js';
```

- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** — `feat(tenant): AsyncLocalStorage tenant context (fail-closed)`.

---

## Chunk 2: Tenant-scoping TableClient decorator

### Task 2: `tenantScoped` decorator

**Files:**
- Create: `backend/shared/data/tenant-client.ts`
- Test: `backend/shared/data/tenant-client.test.ts`
- Reference: `backend/shared/data/table-client.ts` (the `TableClient` interface + `StoredItem`), `keys.ts` (`INDEX`, `partitionAttr`).

- [ ] **Step 1: Write the failing test.** Wrap an `InMemoryTableClient`; assert that under `runWithTenant('t1')`:
  - `put` then `get` round-trips, and the stored item's `PK` begins `T#t1#`.
  - **every** GSI partition is prefixed: put an item with `GSI1PK`, `GSI2PK`, `GSI3PK`, `GSI4PK`; inspect raw storage → each is `T#t1#<orig>`.
  - `queryIndex('GSI2', 'CATEGORY#x')` under t1 returns t1's row; the SAME query under `runWithTenant('t2')` returns nothing (cross-tenant isolation on a non-GSI1 index).
  - any method throws `TenantContextError` when called outside a tenant context.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient } from './memory-client.js';
import { runWithTenant, TenantContextError } from '../tenant/index.js';
import { tenantScoped } from './tenant-client.js';

let raw: InMemoryTableClient;
let c: ReturnType<typeof tenantScoped>;
beforeEach(() => { raw = new InMemoryTableClient(); c = tenantScoped(raw); });

const item = (over = {}) => ({ PK: 'ACTIVITY#1', SK: 'DETAILS', GSI1PK: 'ACTIVITIES', GSI1SK: 'd#1', GSI2PK: 'CATEGORY#volunteer', GSI2SK: 'd#1', ...over });

describe('tenantScoped', () => {
  it('prefixes PK + all GSIxPK and round-trips within a tenant', async () => {
    await runWithTenant('t1', async () => {
      await c.put(item());
      const got = await c.get('ACTIVITY#1', 'DETAILS');
      expect(got).toBeTruthy();
    });
    // raw storage carries the prefix
    const stored = await runWithTenant('t1', () => raw.get('T#t1#ACTIVITY#1', 'DETAILS'));
    expect(stored?.GSI2PK).toBe('T#t1#CATEGORY#volunteer');
  });
  it('isolates a GSI2 query across tenants', async () => {
    await runWithTenant('t1', () => c.put(item()));
    const inT1 = await runWithTenant('t1', () => c.queryIndex('GSI2', 'CATEGORY#volunteer'));
    const inT2 = await runWithTenant('t2', () => c.queryIndex('GSI2', 'CATEGORY#volunteer'));
    expect(inT1).toHaveLength(1);
    expect(inT2).toHaveLength(0);
  });
  it('fails closed with no tenant', async () => {
    await expect(c.get('ACTIVITY#1', 'DETAILS')).rejects.toBeInstanceOf(TenantContextError);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** (`tenant-client.ts`). Prefix on the way in; leave reads to `stripInternal`.

```ts
import { currentTenantId } from '../tenant/index.js';
import type { QueryOptions, StoredItem, TableClient } from './table-client.js';

const GSI_PK_ATTRS = ['GSI1PK', 'GSI2PK', 'GSI3PK', 'GSI4PK'] as const;

export function tenantScoped(inner: TableClient): TableClient {
  const p = (): string => `T#${currentTenantId()}#`;
  const scope = (pk: string): string => `${p()}${pk}`;
  const scopeItem = (item: StoredItem): StoredItem => {
    const out: StoredItem = { ...item, PK: `${p()}${String(item.PK)}` };
    for (const a of GSI_PK_ATTRS) if (out[a] !== undefined) out[a] = `${p()}${String(out[a])}`;
    return out;
  };
  return {
    get: (pk, sk) => inner.get(scope(pk), sk),
    delete: (pk, sk) => inner.delete(scope(pk), sk),
    put: (item) => inner.put(scopeItem(item)),
    query: (pk, opts?: QueryOptions) => inner.query(scope(pk), opts),
    queryIndex: (index, pk, opts?: QueryOptions) => inner.queryIndex(index, scope(pk), opts),
  };
}
```

> Note: verify the exact `TableClient` method signatures in `table-client.ts` and match them (names/params). Reads need no un-prefixing — `stripInternal` already drops `PK`/`SK`/`GSIxPK`.

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(data): tenant-scoping TableClient decorator (prefix PK + all GSIxPK, fail-closed)`.

---

## Chunk 3: Tenant entity, registry, and data wiring

### Task 3: `Tenant` type + registry repo (base client) + expose only scoped data

**Files:**
- Modify: `backend/shared/data/types.ts` (add `Tenant`)
- Modify: `backend/shared/data/collections.ts` (add `makeTenants` on the **base** client; `GSI1PK='TENANTS'`)
- Modify: `backend/shared/data/index.ts` (`dataFromEnv` → scoped client; `makeData(scoped, base)`; expose `tenants` only)
- Test: `backend/shared/data/tenants.test.ts`

- [ ] **Step 1: Failing test** — `tenants.create/get/list` works via the base client and is NOT tenant-prefixed (list works with no tenant context set):

```ts
import { describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData } from './index.js';

it('tenant registry is global (no tenant context needed)', async () => {
  const data = makeData(new InMemoryTableClient());
  await data.tenants.create({ tenantId: 't1', familyName: 'Cuthbertson', plan: 'free', status: 'active' });
  expect((await data.tenants.list()).map((t) => t.tenantId)).toContain('t1');
  expect(await data.tenants.get('t1')).toMatchObject({ familyName: 'Cuthbertson' });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement.**
  - `types.ts`: `export interface Tenant extends Timestamped { tenantId: string; familyName: string; plan: 'free' | 'family'; status: 'active' | 'suspended' | 'past_due'; consent?: { acceptedAt?: string; tosVersion?: string; byEmail?: string }; }`
  - `collections.ts` `makeTenants(client)`: `PK: TENANT#<id>`, `SK: DETAILS`, write `GSI1PK='TENANTS'`, `GSI1SK=<createdAt>#<id>`; `get(id)`, `create(input)`, `list()` via `client.queryIndex('GSI1','TENANTS')`. Uses the raw client passed in (the base, un-scoped one).
  - `index.ts`: change `makeData` to `makeData(scoped: TableClient, base: TableClient = scoped)`; build every existing repo on `scoped`; add `tenants: makeTenants(base)`. `dataFromEnv()` → `const base = tableClientFromEnv(env); return makeData(tenantScoped(base), base);`. For tests, `makeData(inMem)` passes the same client as both (the in-memory client ignores prefixes structurally, but tests that exercise isolation wrap calls in `runWithTenant` + use `tenantScoped` explicitly as in Task 2). **Do NOT** expose `base` on the returned `Data` object — only `tenants` (built internally on `base`).

- [ ] **Step 4: Run, verify pass.** Also run the full suite — `npx vitest run backend/shared/data` — to ensure existing data tests still pass (they construct `makeData(inMem)` and don't set a tenant; confirm they either pass unchanged or are updated to wrap in `runWithTenant` — see Task 8 note).
- [ ] **Step 5: Commit** — `feat(data): Tenant entity + global registry; makeData exposes only scoped repos + tenants`.

> ⚠️ **Decision point during execution:** existing `data.test.ts` and every module handler test call repos without a tenant context. Two options — pick during execution and apply consistently: (a) a test helper `withTenant(fn)` defaulting to `runWithTenant('test')` used in `beforeEach`, or (b) make `InMemoryTableClient` test usage go through `tenantScoped` with a default test tenant. Recommend (a): a shared `backend/shared/tenant/testing.ts` `withTestTenant(fn)` and wrap existing suites' `beforeEach`. This is a broad but mechanical change; budget for it.

---

## Chunk 4: Auth wiring

### Task 4: `Requester.tenantId` + `platformAdmin`, router context wrap, fail-closed claims

**Files:**
- Modify: `backend/shared/auth/types.ts` (`Requester` += `tenantId: string; platformAdmin?: boolean`)
- Modify: `backend/shared/auth/requester.ts` (read `custom:tenantId`, `custom:platformAdmin`; throw 401 if no tenant claim AND not platformAdmin)
- Modify: `backend/shared/api/router.ts` (wrap handler call in `runWithTenant(requester.tenantId, …)`; platform-admin routes run via an explicit base-client path — out of scope detail here, see sub-project 5)
- Test: `backend/shared/auth/requester.test.ts` (extend), `backend/shared/api/router.test.ts` (extend)

- [ ] Steps: failing tests (a JWT with `custom:tenantId` → `Requester.tenantId`; a JWT with neither tenant nor platformAdmin → 401; a request resolves and the handler sees the tenant context) → implement → pass → commit. Keep the role model unchanged.

> The router change is the one cross-cutting edit; verify against the real `router.ts` dispatch (how it builds `HandlerContext` + calls the handler) and wrap exactly that call site.

---

## Chunk 5: S3 document tenant-prefixing

### Task 5: tenant-prefixed document keys

**Files:**
- Create: `backend/modules/documents/keys.ts` (`tenantDocKey(fileName)` → `T/<tenantId>/documents/<newId>/<safeName>`)
- Modify: `backend/modules/documents/handlers.ts` (`uploadUrl` uses `tenantDocKey`)
- Test: `backend/modules/documents/keys.test.ts`

- [ ] Steps: failing test (key starts `T/<tenant>/documents/`) → implement (reads `currentTenantId()`) → pass → commit. `s3DocumentStore` stays key-agnostic.

---

## Chunk 6: Non-request paths

### Task 6: per-tenant digest loop + SQS tenantId

**Files:**
- Modify: `backend/lambda/digest.ts` (enumerate `tenants.list()` via base; per-tenant `runWithTenant` + try/catch)
- Modify: `backend/lambda/hydration.ts` (read `message.tenantId` → `runWithTenant` before dispatch)
- Modify: enqueuers in `college-hub/enqueue.ts`, `college-hub/discover.ts`, `scholarship-tracker/…`, `opportunities/discover.ts` (include `tenantId: currentTenantId()` in the message)
- Test: extend `digest`/discover tests to assert per-tenant scoping + that one tenant's failure doesn't abort the loop.

- [ ] Steps per file: failing test → implement → pass → commit. The digest Lambda must build the base-client `tenants` accessor (the registry is global) and wrap each tenant's `runScheduledDigest` in its own try/catch.

---

## Chunk 7: Migration + CI guard

### Task 7: phased migration script (dry-runnable) + transform unit test

**Files:**
- Create: `backend/scripts/migrate-tenant.mjs` (phases A–D per the spec; `--dry-run`)
- Create: `backend/scripts/lib/retkey.mjs` + `retkey.test.ts` (pure transform: item → prefixed item)

- [ ] Steps: unit-test the pure `retkey(item, tenantId)` transform (PK + all GSIxPK prefixed; SK/sort untouched; registry items skipped) → implement → pass → commit. The script wiring (scan/put/copy-S3/delete) is integration-tested on staging, not in CI.

### Task 8: CI isolation guard

**Files:**
- Create: `scripts/check-tenant-isolation.mjs` (grep for raw `client.put`/`queryIndex` of `GSIxPK`/`PK` outside the decorator; fail build on a hit not in an allowlist: `tenant-client.ts`, `collections.ts` tenants repo, `repo.ts`)
- Modify: root `package.json` (`"check:isolation"`), CI workflow to run it.

- [ ] Steps: failing test (guard flags a planted violation) → implement → pass → commit.

---

## Chunk 8: The deliverable — two-tenant isolation proof

### Task 9: cross-tenant isolation integration test

**Files:**
- Create: `backend/modules/_isolation/cross-tenant.test.ts` (router-level)

- [ ] **Step 1: Write the proof.** Build the real router; seed family A (tenant `A`) and family B (tenant `B`) — activities (incl. a private one), a college, a document row, a conversation, a finaid item. With A's JWT (`custom:tenantId=A`): `GET /activities`, `/colleges`, `/documents`, `/finaid` return only A's; a direct `GET /activities/<B's id>` → not found/forbidden. Repeat with B's JWT. A JWT with no tenant claim → 401. Assert the digest emits per-tenant and the SQS worker scopes by message tenant.
- [ ] **Step 2–4:** run → (should pass given Tasks 1–6) → if any cross-tenant leak, fix the offending seam.
- [ ] **Step 5: Commit** — `test(platform): two-tenant isolation proof (the deliverable)`.

- [ ] **Step 6: Full verification** — `npm run typecheck`, `npm test`, `npm run check:routes`, `npm run check:isolation`, `npm run -w backend build:lambda`, `cd infra && npx cdk synth --quiet`.

- [ ] **Step 7: Live staging check** (manual, after deploy): provision tenants `A`/`B` via the migration/admin path; with each family's real Cognito token confirm cross-tenant reads return nothing and a no-tenant token is rejected.

---

## Sequencing notes
- Chunks 1→2→3 are the core seam and must land first (and the existing test suite updated for the tenant-context requirement — the broadest mechanical change).
- Migration (7) runs on **staging** after the seam is green; **prod only on Grahem's explicit go + PITR/S3 snapshot.**
- After this plan is green and deployed, the next plan is **auth + invites** (sub-project 2).
