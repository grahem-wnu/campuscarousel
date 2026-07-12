# Tenancy & Data Isolation — Design Spec

**Sub-project 1 of the SaaS platform** · **Date:** 2026-06-10 · **Status:** Draft — awaiting Grahem review

## Context

Keira's Journey is a deployed, working, single-family app (3 users, single DynamoDB table, Cognito
username auth, AI woven throughout). Grahem wants to **productize it into a paid, public, multi-tenant
SaaS**. That is a *platform*, not a refactor — several independent subsystems:

0. Compliance & legal (parental consent / COPPA / FERPA — gates launch; not code)
1. **Tenancy & data isolation** — *this spec, the foundation everything else sits on*
2. Self-serve auth & account lifecycle
3. Billing & entitlements (Stripe)
4. Per-tenant AI cost controls & abuse protection
5. Tenant admin & ops (provisioning, support, export, hard-delete)
6. Marketing site + signup funnel

**Decisions already made (Grahem):**
- **Commercial, paid, public** SaaS.
- **Parent-owned family tenant, one student per family** — a parent signs up/pays/consents and adds the
  student (+ optional co-parent). Tenant = family. Maps onto today's `admin`/`parent`/`student` roles;
  cleanest minor-consent posture.
- **Evolve the existing codebase in place** (not greenfield, not fork).
- **Isolation via tenant-prefixed keys + AsyncLocalStorage** (chosen over attribute-filter and
  table-per-tenant).

**This sub-project is scoped tight:** introduce tenancy + provable isolation with **manual tenant
provisioning** (admin-created tenants/users, as today). Self-serve signup, billing, quotas, admin UI,
and marketing are explicitly **out of scope** here and become later sub-projects. We prove isolation
correctness before building the funnel.

## Goals / non-goals

**Goals**
- Every piece of tenant data — DynamoDB items, S3 documents, AI context, the singletons — is scoped to
  exactly one family and unreadable by any other.
- Isolation is the **primary** security boundary, above the existing role model. It holds on request
  paths *and* non-request paths (scheduled digest, SQS workers).
- Near-zero churn to the 22 modules: tenancy threads through the existing `TableClient`/`makeData` seam.
- Keira's family is migrated to be tenant #1 with no data loss.
- **Fail closed:** any data access without a resolved tenant throws — never an un-prefixed read/write.

**Non-goals (this sub-project)**
- Self-serve signup / email verification / password reset (sub-project 2).
- Billing, plans, entitlements (3). Per-tenant AI quotas (4). Admin UI, export, hard-delete UX (5).
- Marketing/landing (6). Cross-tenant analytics. Per-tenant data residency.

## Approach (decided)

**A — Tenant-prefixed keys, injected at the `TableClient` boundary, threaded via AsyncLocalStorage.**

Every `PK` and every `GSIxPK` carries a `T#<tenantId>#` prefix. A `list()` for family A's collection
queries `GSI1PK = T#A#ACTIVITIES`, which physically cannot return family B's rows. The prefix is applied
by a single decorator around the `TableClient`, so `repo.ts`, `collections.ts`, and the 22 modules do
not change. The tenant id is resolved from the JWT per request and read by the decorator from ALS.

Rejected: **B — `tenantId` attribute + filter-on-read** (fetch-then-hope; one missed filter leaks a
family's data; not a real boundary). **C — table-per-tenant silo** (strongest physical isolation but
heavy provisioning/cost/ops; breaks single-table + evolve-in-place; revisit only for a future
enterprise/B2B tier).

## Components

### 1. Tenant context (`backend/shared/tenant/`)
- An `AsyncLocalStorage<{ tenantId: string }>` plus:
  - `runWithTenant(tenantId, fn)` — set context explicitly (used by the router and by background jobs).
  - `currentTenantId(): string` — read it; **throws `TenantContextError` if unset** (the security backstop).
- Pure, framework-free, unit-tested. No AWS.

### 2. Tenant-scoping `TableClient` decorator (`backend/shared/data/tenant-client.ts`)
- `tenantScoped(client: TableClient): TableClient` wrapping all five methods:
  - `get(pk, sk)`, `delete(pk, sk)`, `query(pk, …)` → prefix `pk` with `T#${currentTenantId()}#`.
  - `queryIndex(index, pk, …)` → prefix the partition value for **every** index — not just GSI1. The
    GSI2/GSI3/GSI4 lookups (activities-by-category, clinical-by-facility, TEAS-by-date) must be prefixed
    too, or those queries leak cross-tenant.
  - `put(item)` → prefix `item.PK` **and iterate every present `GSI{1..4}PK` attribute**, prefixing each.
    Some writers (e.g. `collections.ts` `makeConversations`, and the activities/clinical/TEAS index
    projections) set `GSIxPK` to bare constants directly through `client.put`; the decorator must catch
    all of them via a loop over the index set, not a hard-coded `GSI1PK`. **This symmetry (prefix on
    both write `GSIxPK` and `queryIndex` partition, for all indexes) is the single most important
    correctness property of the whole design.**
- Reads need **no** un-prefixing: `stripInternal` already drops `PK`/`SK`/`GSIxPK` before returning the
  domain object.
- The decorator calls `currentTenantId()` at each operation → fail-closed by construction.
- **Completeness rests on this being the only path to DynamoDB.** Verified: every access in the codebase
  goes through these five `TableClient` methods (no `Scan`/`BatchWrite`/`TransactWrite`/raw-client use).
  A CI guard (see Testing) enforces that no future writer bypasses the decorator.

### 3. Data accessor wiring (`backend/shared/data/index.ts`)
- `dataFromEnv()` → `makeData(tenantScoped(tableClientFromEnv(env)))`.
- `makeData` internally also holds the **un-scoped** base client, but exposes it to callers **only**
  through the `tenants` registry accessor (below). The base client is **not** returned to module code —
  the 22 modules can reach only tenant-scoped repos, so no future module can accidentally bypass
  isolation. This is a hard interface boundary, enforced by `makeData`'s return type.
- `routes.manifest` closures (`getData = () => cached ??= dataFromEnv()`) are unchanged — the per-Lambda
  cached `Data` is fine because the *client* resolves the tenant per operation via ALS.

### 4. Tenant registry (`backend/shared/data/collections.ts` + a `tenants` repo)
- The one intentionally-global namespace: `PK: TENANT#<tenantId>`, `SK: DETAILS`.
- `Tenant` entity: `tenantId`, `familyName`, `plan` (placeholder for sub-project 3), `status`
  (`active`|`suspended`), `consent` (placeholder map for sub-project 0), `createdAt`, `updatedAt`.
- **Enumeration backing:** the registry item carries `GSI1PK = 'TENANTS'`, `GSI1SK = <createdAt>#<tenantId>`,
  so `tenants.list()` is a normal `queryIndex(GSI1, 'TENANTS')` — **no new GSI** (reuses GSI1, consistent
  with §8) and **no `Scan`**. Because the registry is global, the `tenants` repo writes/reads through the
  **base (un-scoped) client**, so `GSI1PK` stays the literal `'TENANTS'` (NOT tenant-prefixed). This is the
  one deliberate asymmetry in the design and must be called out in code: the tenant registry is the only
  thing written un-prefixed.

### 5. Auth (`backend/shared/auth/`)
- `Requester` gains `tenantId: string`. This **additively extends** the "frozen contract" `Requester`
  shape — safe because it's a new required field set centrally in `getRequester`; the plan must update
  `auth/types.ts`, the contract comments, and `requester.test.ts` accordingly.
- `getRequester` reads `custom:tenantId` from JWT claims; **a request with no tenant claim is rejected
  (401)** before any handler runs.
- The router wraps handler execution in `runWithTenant(requester.tenantId, () => handler(ctx))`.
- The role model (`admin`/`parent`/`student`, `canSeePrivate`, `filterForRequester`) is unchanged — it
  now operates *within* a tenant.

### 6. S3 documents
- Object keys become `T/<tenantId>/documents/<id>/<file>`. The prefix is built where keys are
  **constructed** — the `documents` module handler (`uploadUrl`'s `s3Key = …`) and any other caller —
  reading `currentTenantId()` there. `s3DocumentStore` itself stays key-agnostic (it takes a key); a thin
  helper `tenantDocKey(name)` centralizes prefixing so no caller forgets. One bucket, tenant-prefixed keys.
- **Migration note (data correctness):** existing document rows store un-prefixed S3 keys AND the bytes
  live at the un-prefixed object path. The migration (below) must therefore **(a)** copy each S3 object to
  its new `T/<tenant1>/…` key and delete the old object, AND **(b)** rewrite the `s3Key` attribute on the
  DynamoDB document row — not just re-key the row's PK. (Few/zero objects exist today, but the script must
  handle them.)

### 7. Non-request paths
- **Digest Lambda** (`backend/lambda/digest.ts`): restructure from a single `dataFromEnv()` call to:
  `tenants.list()` → for each tenant, `runWithTenant(tenantId, () => runScheduledDigest(...))`, **each
  wrapped in its own try/catch** so one tenant's failure logs loudly and the loop continues (a single bad
  tenant must never silently skip everyone after it). Per-tenant `REMINDER_SETTINGS`/`lastSentAt`/
  `notifiedEventIds` are read/written inside that tenant's context.
- **SQS discovery worker** (`backend/lambda/hydration.ts` + module handlers): every enqueued message
  carries `tenantId`; the worker calls `runWithTenant(message.tenantId, …)` before touching data.
  Enqueuers (`college-hub`, `scholarship-tracker`, `opportunities`) include `tenantId` in the message.

### 8. Infra
- No new table/GSI (prefixing reuses existing keys/indexes). Cognito users gain a `custom:tenantId`
  attribute (schema addition). The migration is a one-off script, not infra.

## Data flow

**Request:** API GW (JWT authorizer) → router resolves `Requester{ username, role, tenantId }` →
`runWithTenant(tenantId)` → handler → `getData()` → scoped client prefixes keys with `T#<tenantId>#` →
DynamoDB. Cross-tenant reads are impossible because the partition value embeds the tenant.

**Scheduled digest:** EventBridge → digest Lambda → `tenants.list()` (base client) → per tenant
`runWithTenant` → existing digest logic.

**Async discovery:** API enqueues `{ type, tenantId, … }` → worker `runWithTenant(tenantId)` → discoverer
writes back under the tenant's keys → frontend polls (in-tenant).

## Migration (Keira → tenant #1)

A one-time, **dry-runnable** Node script (`backend/scripts/migrate-tenant.mjs`), in **phases** (not
write-then-delete per item, so a mid-run failure can't leave a mixed prefixed/un-prefixed table):
1. Assign `tenant1 = <generated id>`; create the `TENANT#tenant1` registry record (written un-prefixed
   via the base client, with `GSI1PK = 'TENANTS'`).
2. **Phase A — write all new:** scan the table; for each existing tenant-data item, compute the prefixed
   `PK` and every `GSIxPK`, and write the transformed copy. (Idempotent — re-runnable.)
3. **Phase B — verify:** counts pre/post match; spot-check several entities read back through the scoped
   client under `runWithTenant(tenant1)`.
4. **Phase C — S3 relocation:** for each document row, copy the object to `T/<tenant1>/…`, rewrite the
   row's `s3Key`, then delete the old object.
5. **Phase D — delete old:** only after A–C verify, delete the original un-prefixed items.
6. Set `custom:tenantId = tenant1` on Keira's three Cognito users (CLI/admin).

`--dry-run` prints the plan and counts without writing. Runs on **staging first** (destroyable) to prove
correctness; **prod runs only on Grahem's explicit go**, with a DynamoDB PITR checkpoint + S3 versioning/
inventory snapshot taken first.

## Error handling / edge cases

- **No tenant context** → `currentTenantId()` throws `TenantContextError`; the decorator never issues an
  un-prefixed operation. A request with no `custom:tenantId` claim → 401 at the router.
- **Background job missing tenantId** (message without it) → drained/failed loudly, never run un-scoped.
- **Suspended tenant** → `Tenant.status` exists now, but enforcement is a **no-op stub** in this
  sub-project (a `requireActiveTenant()` hook that currently always passes). A live check means reading the
  registry on every request (a base-client `get TENANT#<id>` on the hot path), so the actual enforcement +
  any caching is deferred to sub-project 3 (billing/entitlements), where it belongs.
- **Legacy un-prefixed items** post-migration → none should exist; the migration verifies, and a
  follow-up guard can scan for un-prefixed PKs as a CI/ops check.

## Testing — the deliverable is a provable two-tenant isolation proof

- **Unit:** `runWithTenant`/`currentTenantId` (set/read/fail-closed); the `tenantScoped` decorator
  prefixes PK + every GSIxPK on read/write and never leaks across a context boundary.
- **Integration (real shared router, in-memory table):** seed family A and family B; assert A's JWT
  cannot `get`/`list`/`detail` B's data, documents, conversations, or AI grounding (and vice-versa); a
  JWT with no tenant claim → 401; the digest enumerates tenants and emails each family only its own
  items; an SQS message scopes the worker to its tenant.
- **Migration test:** seed pre-tenant items in-memory, run the transform, assert every item is re-keyed
  and counts match; `--dry-run` writes nothing.
- **Live staging check:** provision two test families; with each family's real Cognito token, confirm
  cross-tenant reads return nothing and a no-tenant token is rejected.
- **CI isolation guard (deliverable, not optional):** a check (script run in CI) that fails the build if
  any code path writes/reads DynamoDB outside the `tenantScoped` decorator — i.e. greps for direct
  `client.put`/`queryIndex` of a `GSIxPK`/`PK` that isn't routed through the seam, and (post-migration, as
  an ops check) scans for any stored item whose `PK` lacks a `T#` prefix except the `TENANT#`/`TENANTS`
  registry. This is the belt-and-suspenders that catches a future writer silently breaking isolation.

## Build sequence (for the implementation plan; not built yet)

1. `tenant` context module (+ tests).
2. `tenantScoped` decorator (+ tests).
3. `Tenant` entity + `tenants` registry repo on the base client; wire `dataFromEnv`.
4. `Requester.tenantId` + `getRequester` + router `runWithTenant` wrap + no-claim 401.
5. S3 storage seam prefixing.
6. Non-request paths: digest per-tenant loop; SQS message `tenantId` + worker context.
7. Migration script (phased + dry-run + S3 relocation + tests); staging run.
8. CI isolation guard.
9. Two-tenant isolation integration proof + live staging verification.

## Open questions for review

- Spec location: `spec/platform/` (here) vs elsewhere — confirm.
- Tenant id format: opaque UUID vs slug. (Default: opaque id.)
- Prod migration timing — gated on Grahem's explicit go + PITR + S3 snapshot.

## Review status

Independent spec review (2026-06-10): **approved**, with five correctness gaps which are now folded in —
prefix **all** GSI indexes (not just GSI1) on write + queryIndex; back `tenants.list()` with a `TENANTS`
collection on GSI1 (no Scan); S3 prefix at key-construction + relocate objects in the migration;
per-tenant try/catch in the digest loop; hard base-client boundary + CI isolation guard as a deliverable.

---
*Author: Grahem + Claude. Sub-project 1 of the SaaS platform decomposition.*
