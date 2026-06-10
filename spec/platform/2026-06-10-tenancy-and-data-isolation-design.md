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
  - `queryIndex(index, pk, …)` → prefix the GSI partition value.
  - `put(item)` → prefix `item.PK` and every present `GSIxPK` attribute.
- Reads need **no** un-prefixing: `stripInternal` already drops `PK`/`SK`/`GSIxPK` before returning the
  domain object.
- The decorator calls `currentTenantId()` at each operation → fail-closed by construction.

### 3. Data accessor wiring (`backend/shared/data/index.ts`)
- `dataFromEnv()` → `makeData(tenantScoped(tableClientFromEnv(env)))`.
- The **un-scoped** base client is still used for the tenant registry only (below). `makeData` gains a
  `tenants` accessor built on the base client; everything else uses the scoped client.
- `routes.manifest` closures (`getData = () => cached ??= dataFromEnv()`) are unchanged — the per-Lambda
  cached `Data` is fine because the *client* resolves the tenant per operation via ALS.

### 4. Tenant registry (`backend/shared/data/collections.ts` + a `tenants` repo)
- The one intentionally-global namespace: `PK: TENANT#<tenantId>`, `SK: DETAILS`.
- `Tenant` entity: `tenantId`, `familyName`, `plan` (placeholder for sub-project 3), `status`
  (`active`|`suspended`), `consent` (placeholder map for sub-project 0), `createdAt`, `updatedAt`.
- Accessed via the **base** (un-scoped) client. `tenants.list()` lets background jobs enumerate tenants.

### 5. Auth (`backend/shared/auth/`)
- `Requester` gains `tenantId: string`. `getRequester` reads `custom:tenantId` from JWT claims;
  **a request with no tenant claim is rejected (401)** before any handler runs.
- The router wraps handler execution in `runWithTenant(requester.tenantId, () => handler(ctx))`.
- The role model (`admin`/`parent`/`student`, `canSeePrivate`, `filterForRequester`) is unchanged — it
  now operates *within* a tenant.

### 6. S3 documents (`backend/shared/storage/`)
- Object keys prefixed `T/<tenantId>/documents/<id>/<file>`; the storage seam reads `currentTenantId()`.
- Existing presign/visibility logic unchanged otherwise. One bucket, tenant-prefixed keys.

### 7. Non-request paths
- **Digest Lambda** (`backend/lambda/digest.ts`): enumerate `tenants.list()`; for each, run the existing
  digest inside `runWithTenant(tenantId, …)`. (Per-tenant `REMINDER_SETTINGS` is read inside context.)
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

A one-time, **dry-runnable** Node script (`backend/scripts/migrate-tenant.mjs`):
1. Assign `tenant1 = <generated id>`; create the `TENANT#tenant1` registry record.
2. Scan the table; for each item, compute the prefixed `PK` and each `GSIxPK`; write the transformed
   item; verify a read-back; then delete the original (or write-new-then-delete-old in batches).
3. Verify item counts pre/post and spot-check a few entities; print a summary. `--dry-run` prints the
   plan without writing.
4. Set `custom:tenantId = tenant1` on Keira's three Cognito users (CLI/admin).

Runs on **staging first** (destroyable) to prove correctness; **prod runs only on Grahem's explicit go**,
with a table PITR/backup checkpoint taken first.

## Error handling / edge cases

- **No tenant context** → `currentTenantId()` throws `TenantContextError`; the decorator never issues an
  un-prefixed operation. A request with no `custom:tenantId` claim → 401 at the router.
- **Background job missing tenantId** (message without it) → drained/failed loudly, never run un-scoped.
- **Suspended tenant** → registry `status` checked at the router; suspended → 403 (hook for sub-project 3).
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

## Build sequence (for the implementation plan; not built yet)

1. `tenant` context module (+ tests).
2. `tenantScoped` decorator (+ tests).
3. `Tenant` entity + `tenants` registry repo on the base client; wire `dataFromEnv`.
4. `Requester.tenantId` + `getRequester` + router `runWithTenant` wrap + no-claim 401.
5. S3 storage seam prefixing.
6. Non-request paths: digest per-tenant loop; SQS message `tenantId` + worker context.
7. Migration script (+ dry-run + tests); staging run.
8. Two-tenant isolation integration proof + live staging verification.

## Open questions for review

- Spec location: `spec/platform/` (here) vs elsewhere — confirm.
- Tenant id format: opaque UUID vs slug. (Default: opaque id.)
- Whether to add a CI guard that scans for any un-prefixed `PK` post-migration (recommended, cheap).
- Prod migration timing — gated on Grahem's explicit go + PITR checkpoint.

---
*Author: Grahem + Claude. Sub-project 1 of the SaaS platform decomposition.*
