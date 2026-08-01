# Metering correctness + family engagement visibility

**Tier**: 3
**Date**: 2026-08-01
**Status**: Approved — implemented

## Summary

Two related problems, found while auditing the metering feature against live prod data.

**Metering is wrong in three ways.** The reconciliation job's Cost Explorer filter matches a service
name AWS doesn't use, so it reads `$0` in AWS actuals every run — which makes `driftPct` hard-return
100 and fire a false SNS breach alert daily. The pricing table charges global-profile rates while prod
runs the regional (`us.`) profile, which carries a verified 10% premium, so every reported cost is
exactly 10% low. And Interview Prep invokes Bedrock through its own private client, bypassing both
metered seams entirely, with no CI guard to stop the next module doing the same.

**The dashboard measures the wrong thing.** It reports cost and tokens but not whether anyone is
using the product. Five families onboarded between Jul 12–26; four did a single session (8–31 minutes)
and never returned; nobody has opened the app since Jul 26. None of that was visible in the admin UI —
answering "is anyone using this" required a raw table scan.

## Evidence (prod, July 2026)

| signal | value |
|---|---|
| App-recorded Bedrock cost | $20.19 |
| Cost Explorer, app's filter `SERVICE = 'Amazon Bedrock'` | **$0.00** |
| Cost Explorer, actual service names (`Claude Sonnet 4.6 (Amazon Bedrock Edition)` + Haiku) | $43.59 |
| Pre-metering spend (Jul 4/11/12, before Phase 1 shipped) | $17.10 |
| Post-metering AWS vs app ratio, every active day | **0.90909** (= 10/11, exactly) |
| Billing usage type `USE2_InputTokenCount-Units` (regional) | $3.30 / 1M |
| Billing usage type `USE2_InputTokenCount_Global-Units` (global) | $3.00 / 1M |
| Stored `GLOBAL#RECON / MONTH#2026-07` | `awsCostMicros: 0, driftPct: 100, breach: true` |

The 10% gap is fully explained by the regional-vs-global profile premium; it is not missing calls.
Token coverage is sound (app 5,367,257 vs invocation logs 5,422,472, a 1.0% residual).

## Decisions taken

1. **Switch prod to the global inference profile** (`global.anthropic.claude-sonnet-4-6`, confirmed
   ACTIVE in us-east-2) — a real ~10% cut on all AI spend. Accepted trade-off: global profiles may
   route inference to any commercial AWS region.
2. **Stamp `lastSeenAt` at the router auth choke point** and surface it alongside AI-derived activity,
   so a family that logs in and does nothing still registers as active.

## Changes

| File | Change |
|------|--------|
| `backend/modules/reconciliation/aws-ports.ts` | Group Cost Explorer by SERVICE without a service filter; sum every group whose key matches `/bedrock/i`. Survives new model names. |
| `backend/shared/metering/pricing.ts` | Split `normalizeModelId` into `{ geo, model }`. Rate table keyed by model, holding **global** base rates; regional geos (`us.`/`eu.`/`apac.`) multiply by `REGIONAL_PREMIUM = 1.1`. |
| `backend/modules/interview-prep/ai.ts` | Delete the private `invokeText()`; route both generators through `invokeMessages({ feature: 'interview-prep' })`. Keep the injectable client seam for tests. |
| `scripts/check-metering.mjs` | **New.** Fail if any file outside the two approved seams imports `@aws-sdk/client-bedrock-runtime` or names `InvokeModelCommand`/`ConverseCommand`. |
| `package.json` | Add `check:metering` script. |
| `.github/workflows/ci.yml` | Run `check:metering`. Also run the **already-written but never-wired** `check:isolation` guard. |
| `infra/cdk.json` | `bedrockSonnetProfile` → `global.anthropic.claude-sonnet-4-6`. |
| `infra/lib/policies.ts` | Widen the inference-profile ARN so a `global.` profile resolves; keep the foundation-model scope. |
| `backend/shared/api/router.ts` | After tenant resolution, fire-and-forget a throttled last-seen stamp. Never blocks or fails the request. |
| `backend/shared/data/last-seen.ts` | **New.** Write `TENANT#<tid> / LASTSEEN#<userId>`; in-memory 1h per-container throttle. |
| `backend/modules/admin-usage/families.ts` | Add `lastAiCallAt` + `activeDays` to the per-family summary. |
| `backend/modules/admin-usage/handlers.ts` | Read each tenant's `LASTSEEN#` rows; merge `lastSeenAt` + `activeUsers` into the families response. |
| `frontend/src/modules/admin-usage/types.ts` | Mirror the new response fields. |
| `frontend/src/modules/admin-usage/AdminUsagePage.tsx` | Add **Last seen**, **Last AI**, **Active days** columns with relative formatting and a stale-family warning style. |

Two additions discovered during implementation, both small and in-scope:

| File | Change |
|------|--------|
| `scripts/check-tenant-isolation.mjs` | Wiring this guard into CI revealed it had been failing on **four** files — three pre-existing (`metering/record.ts`, `admin-usage/routes.manifest.ts`, `lambda/reconcile.ts`) plus the new `last-seen.ts`. That is almost certainly why it was written but never wired up. All four legitimately address GLOBAL partitions and build the tenant prefix into the key literally, so they are allow-listed with justification rather than the guard being left dead. |
| `vitest.config.ts` | Exclude `agents/**`. Those are untracked whole-repo working copies from the multi-agent waves; `.worktrees/**` was already excluded but this sibling was missed. Locally they re-ran every suite ~7x against stale code, which made a real failure impossible to attribute from a local run. |

## Data model

One new row shape, in the existing global tenant partition:

```
PK: TENANT#<tenantId>
SK: LASTSEEN#<userId>
    { tenantId, userId, role, lastSeenAt }
```

Three deliberate choices:

- **A separate SK, not an attribute on `DETAILS`.** `TenantRepo.update()` does a read-modify-write full
  `put`, so a `lastSeenAt` attribute on the tenant row would be silently clobbered by any concurrent
  tenant edit. A separate key makes that race impossible.
- **No `GSI1PK`.** The tenant registry is enumerated via `GSI1PK = 'TENANTS'`; these rows must stay out
  of that index or `tenants.list()` would return phantom families.
- **Per-user, not per-family.** Same write cost, and the family's last-seen is just the max — but it
  also answers "which member is actually using this", which family-level rows can't.

## Business logic

**Throttle.** A module-level `Map<userId, epochMs>` skips the write unless the last stamp from this
container is >1h old. Lambda container reuse makes this ~1 tiny write per user per hour; a cold start
costs one extra write. No read is needed to decide, so the request path adds at most one `put`. The
throttle is marked only on a *successful* put, so a transient failure retries on the next request
rather than being suppressed for an hour.

**Failure policy.** The stamp mirrors `recordUsage`: it never throws. A last-seen write failure must
never break a user's request.

**Awaited, not fire-and-forget** *(changed during implementation)*. The spec originally called for a
dangling promise. That is wrong on Lambda: the container freezes once the response is returned, so
the write would be dropped or resumed on an unrelated later invocation — making the whole feature
unreliable. Given the throttle, awaiting costs one `put` on at most one request per user per hour.
The router additionally wraps the await in its own `try/catch`: that call sits inside the dispatch
`try`, so without it a throwing recorder would surface as a 500 on a healthy request. A test pins
this (`still serves the request when the stamp throws`) — it caught exactly that bug.

**No-table guard.** With neither an injected client nor `TABLE_NAME`, the recorder returns silently.
That is the "not a deployed environment" signal; without it every one of the ~25 router test suites
would throw-and-log on each request.

**Range semantics.** `calls`, `cost`, tokens, `lastAiCallAt`, and `activeDays` are computed within the
selected date range, consistent with today's behaviour. `lastSeenAt` is **all-time** — a family's last
login isn't a function of the range you're looking at. The UI labels this.

## Edge cases & error handling

- Cost Explorer returns no Bedrock-matching group → `awsCostMicros = 0` **with** `actualsAvailable`
  already false-able; keep the existing distinction between "no run" and "no actuals" intact.
- An unlisted model still records tokens with `unpriced: true, costMicros: 0` (unchanged fail-safe).
- A model id with no geo prefix → treated as global base rates, no premium.
- A family with `LASTSEEN#` rows but zero usage in range → shows `lastSeenAt`, dashes for AI columns.
- A family with usage but no `LASTSEEN#` rows (all pre-dating this change) → dash for last seen. Not
  backfilled: there is no source for it. Expected for all five current families until they next log in.
- Platform-admin requests carry no tenant → no stamp.

## Acceptance criteria

- [ ] Reconciliation reads non-zero AWS actuals for a month with known Bedrock spend
- [ ] `driftPct` for July recomputes to a real percentage, not the `awsMicros == 0` sentinel 100
- [ ] Drift no longer breaches on a month where app and AWS agree within 5%
- [ ] `priceUsage('us.anthropic.claude-sonnet-4-6', …)` returns exactly 1.1× the `global.` result
- [ ] Re-pricing July's recorded tokens lands within 5% of the $43.59 CE figure net of pre-metering spend
- [ ] Interview Prep question + feedback generation writes a `feature: 'interview-prep'` usage row
- [ ] `npm run check:metering` fails when a new file imports the Bedrock SDK directly
- [ ] CI runs both `check:metering` and `check:isolation`
- [ ] An authenticated request stamps `LASTSEEN#<userId>`; a second within the hour does not
- [ ] `tenants.list()` is unaffected by the new rows
- [ ] A last-seen write failure does not fail the request
- [ ] The families table shows Last seen / Last AI / Active days, with stale families visually flagged

## Test plan

- **Unit** — `pricing.test.ts`: geo split, premium multiplier, unlisted model, absent prefix.
  `last-seen.test.ts`: throttle window, no-GSI assertion, swallowed failure.
  `families.test.ts`: `activeDays` distinct-day counting, `lastAiCallAt` max, empty range.
  `compute.test.ts`: drift when actuals are genuinely zero vs unavailable.
- **Integration** — `router.test.ts`: stamp fires once per window, skipped for platform admin, request
  still succeeds when the stamp throws. `admin-usage/router.test.ts`: families response shape.
  A fake-CE test asserting the `/bedrock/i` group matcher picks up per-model service names.
- **Manual QA (staging)** — deploy, confirm the AI Lambdas still invoke under the **global** profile
  (this is the one change that can break inference if the IAM ARN shape differs), log in, confirm a
  `LASTSEEN#` row appears, reload the admin page and confirm the new columns populate.
- **Prod verification** — invoke the reconcile Lambda manually and confirm `awsCostMicros` is non-zero
  and `breach` clears.

## Rollout risk

The profile switch is the only change that can take AI down. `bedrockInvokeStatement` currently scopes
to `arn:aws:bedrock:*:<account>:inference-profile/<id>`; a `global.` profile may not resolve under that
shape. Staging deploys from `dev` automatically, so it gets proven there before prod. If inference
fails on staging, reverting is a one-line `cdk.json` change — and the pricing fix is independent, so
correctness lands either way.
