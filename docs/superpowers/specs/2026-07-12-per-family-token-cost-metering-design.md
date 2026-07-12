# Per-Family Bedrock Token-Cost Metering — Design

**Date:** 2026-07-12
**Status:** Design (approved for spec review)
**Author:** Grahem + Claude

## Problem

We need to know what Bedrock (Claude) is costing us **per family/account**, plus overall.
AWS Cost Explorer can only slice at the account/service level — every tenant shares a single
Sonnet-4 inference profile, so AWS bills it as one line and has no concept of our tenants.
Per-family attribution must therefore happen in our own code, at the one place that knows both
the token counts and the authenticated tenant.

The token counts we need are already present in every Bedrock response — we currently discard
them. Every call site parses `payload.content[].text` and drops the rest of the envelope, which
is where `usage` lives.

## Goals

- **Billing-grade** per-family Bedrock cost: accurate, auditable, reconcilable against AWS actuals.
- **Cost only** (what we pay AWS) — internal unit-economics / cost-recovery accounting. No customer
  markup, no tiered-plan billing in this feature.
- Breakdowns: **per family, per student, per feature, per model, per month (time series).**
- Metering must never degrade or break a user-facing AI call.

## Non-Goals

- Marked-up pricing, tiered plans, or customer invoicing (explicitly out — "cost only").
- Tavily / web-search cost metering. It is a **separate, non-Bedrock** cost line; flagged as known
  future work, not built here.
- Hard per-family spend limits / throttling. Visibility + reconciliation only.

## Current State (as-is)

All 16 Bedrock call sites use `InvokeModelCommand` with the Anthropic Messages API
(`anthropic_version: bedrock-2023-05-31`). None use the Converse API. None read `usage`.

**Group A — route through the shared web-grounded wrapper** `backend/shared/ai/bedrock.ts`
(`converseWithSearch` → `callModel`, which does `InvokeModel` per search round):
peer-benchmark, certifications/guidance, college-hub (ai/checklist-ai/prep-ai), focus/ai,
onboarding-chat/ai, opportunities/ai, scholarship-tracker (ai/discover).

**Group B — build their own `InvokeModelCommand`, bypassing the wrapper (8 sites):**
`goal-tracker/bedrock.ts`, `demonstrated-interest-contacts/bedrock.ts`, `ai-assistant/bedrock.ts`,
`application-central/ai.ts`, `campus-visit-planner/prep.ts`, `certifications/suggester.ts`,
`exam-prep/ai.ts`, `master-timeline/ai.ts`.

There is **no single choke point** today, and **no pricing/cost config** anywhere.

**Tenant identity:** `backend/shared/auth/requester.ts` `getRequester(event)` reads the validated
Cognito JWT claims → `{ username, role, tenantId (custom:tenantId), platformAdmin }`. The tenant id
flows into the data layer via `currentTenantId()` (async-local context in `backend/shared/tenant`).

**Single-table keys:** `tenantScoped(inner)` prefixes every PK with `T#<tenantId>#`;
`studentScoped(...)` yields `T#<tenantId>#S#<studentId>#<key>`.

**Model config:** env var `BEDROCK_MODEL_ID`, set by infra to `config.bedrockSonnetProfile`
(default `us.anthropic.claude-sonnet-4-20250514-v1:0`, a cross-region inference profile).

## Approach (chosen: A — raw records as source of truth, aggregate on read)

One instrumented seam that all 16 call sites route through. Every `InvokeModel` round-trip writes
one **append-only** usage record carrying all dimensions. Dashboards `Query` a family's records for
a period and group-by in memory. A scheduled job derives monthly rollups and reconciles against AWS.

Rejected alternatives:
- **B (dual-write rollup counters):** combinatorial counter rows across 4 dimensions + drift risk;
  premature optimization at family scale.
- **C (emit metrics, aggregate out-of-band):** extra infra (Firehose/Athena), eventual, weak
  in-app querying.

## Design

### 1. New module `backend/shared/metering/`

- **`pricing.ts`** — model id → per-token rates, in code (versioned, reviewable, date-stamped;
  not SSM). Normalizes the model id (strip the `us.` cross-region prefix and version) so
  `us.anthropic.claude-sonnet-4-*` maps to one rate entry. Rates for four token classes:
  fresh input, output, cache-read input, cache-write (creation) input. Unknown model → tokens
  recorded, `unpriced=true`, cost 0. **Exact current Sonnet-4 Bedrock rates to be pulled from the
  claude-api reference at implementation time**, not from memory.
- **`record.ts`** — `recordUsage({ tenantId, studentId?, feature, model, usage, requestId, callId })`:
  computes `costMicros`, writes one append-only item. Reads `currentTenantId()` when a caller does
  not pass `tenantId` explicitly.
- **`invokeModelMetered.ts`** — the single seam. Sends the `InvokeModelCommand`, parses
  `content[].text` **and** the `usage` object, calls `recordUsage`, returns `{ text, usage }`.

### 2. Metering altitude

Meter at the **per-`InvokeModel` level**. `converseWithSearch` makes multiple round-trips per
logical operation; AWS bills each, so each round writes its own record, all sharing one
`requestId`. Group B's single-shot callers write one record each. `converseWithSearch`'s inner
send and all 8 Group B sites are refactored to call `invokeModelMetered`.

### 3. Data model (single table, append-only)

```
PK  = T#<tenant>#USAGE
SK  = TS#<iso8601>#<callId>        # sortable; month query via begins_with(SK, "TS#2026-07")
attrs:
  studentId?        # nullable — some calls are tenant-level, not student-scoped
  feature           # 'essay-coach' | 'college-hydrate' | 'focus' | 'benchmark' | ...
  model             # normalized model id
  inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens
  costMicros        # integer micro-dollars ($1 = 1_000_000 micros)
  unpriced          # bool — true if model had no rate entry
  requestId         # groups multi-round operations
  occurredAt        # iso8601
```

All breakdowns (student / feature / model / month) derive from one `Query` + group-by. No TTL in
Phase 1 (billing-grade audit trail); a long TTL (e.g. 400 days) may be added later.

### 4. Cost math

`costMicros = inputTokens·inR + outputTokens·outR + cacheReadTokens·crR + cacheWriteTokens·cwR`,
all integer micro-dollars. Capturing all four token classes (not just input/output) is required
for the number to be accurate when prompt caching is in play.

### 5. Async worker attribution (critical)

Most tokens burn in the SQS workers (hydration / focus / essay-coach), which call Bedrock off a
message, not a JWT. Requirement: each SQS message carries `tenantId` (+ `studentId`, `feature`),
and the worker sets `currentTenantId()` before the AI call so `recordUsage` attributes correctly.
**Implementation must verify each worker actually does this** — a worker that doesn't would
mis-attribute spend, which breaks billing-grade.

### 6. Reporting API

Authz off the JWT (`getRequester` → `platformAdmin` / `tenantId`); never trust the client.

- `GET /admin/usage?tenantId=&from=&to=&groupBy=feature|student|model|day` — one family's spend
  with a breakdown dimension. Tenant admin may query **only their own** tenant; platform admin
  (grahem) may query any.
- `GET /admin/usage/families?month=` — **platform-admin only**: cost per family for a month, read
  from derived rollup rows (§7) so it does not scan every raw record across all tenants.

### 7. Rollup + reconciliation job (Phase 2)

Scheduled daily Lambda:
1. **Recompute** per-tenant / per-feature / per-student / per-model monthly summary rows from raw
   records (idempotent overwrite — derived, no dual-write drift, always recomputable from source).
   These back the platform-wide view.
2. **Reconcile** app-computed Bedrock cost for the period against AWS actuals — via Bedrock model
   invocation logging (token counts) and/or Cost Explorer `GetCostAndUsage`. Drift beyond a
   threshold (~2%) alerts through the existing `ObservabilityStack`. Catches a bypassed call site
   or a stale rate.

Enabling Bedrock model invocation logging (small infra add) doubles as the backstop source of
truth if an app-side record is ever dropped.

### 8. Error handling

Metering never breaks a user-facing AI call: `recordUsage` failures are caught, logged loudly
(structured), and swallowed. Integrity is preserved by the backstop — invocation logs + the
reconciliation job make any dropped record **visible**, not silent. Unknown model → `unpriced=true`,
`costMicros=0`, flagged by reconciliation.

## Testing

- **Unit:** pricing math across input/output/cache-read/cache-write combos → `costMicros`;
  unknown model → `unpriced`; `recordUsage` builds correct PK/SK/attrs; `invokeModelMetered`
  parses `usage` from a mocked response and degrades gracefully when `usage` is absent.
- **Integration:** a call through each refactored site writes a record attributed to the right
  tenant + feature.
- **Authz:** tenant admin cannot read another family's usage; platform admin can (prove both).
- **Reconciliation:** seeded raw records roll up to the expected monthly totals.

## Phasing

- **Phase 1** (delivers real per-family numbers): metering module + `pricing.ts` + choke-point
  refactor of all 16 sites + raw records + `GET /admin/usage`. Deploy to staging, verify
  attribution end-to-end (per-family, per-feature, per-student).
- **Phase 2:** monthly rollup rows + `GET /admin/usage/families` + reconciliation job + Bedrock
  invocation-logging infra + drift alerting.

## Open questions / risks

- **Exact Sonnet-4 Bedrock rates** — pull from claude-api reference at build time; date-stamp.
- **Rate changes mid-period** — v1 uses a single current-rate table; dated rate tiers deferred
  (reconciliation catches drift in the meantime).
- **Worker attribution gaps** — must be verified per worker during implementation.
- **Cache-token field names** — confirm the exact `usage` field names Bedrock returns for
  cache-read / cache-creation on the Messages API during implementation.
