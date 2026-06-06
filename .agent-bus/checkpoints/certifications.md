# certifications — checkpoint

## worker-2 @ 2026-06-06T17:05:00Z — claimed, PR #14 (draft)

Claimed `certifications` (wave 2) via atomic ref-create on `feat/certifications`. Draft PR #14 → dev.
All foundational deps merged; building against the frozen shared contracts (consume-only).

**Privacy:** spec marks this entity **family-visible** — no private filtering. Identity is still
resolved off the JWT (`ctx.requester`) and every endpoint is auth-gated by the shared router (401 on
no JWT). No privacy test applies; instead the router integration test proves the 401 path.

**Endpoints:** `GET /certifications` (status filter), `GET /certifications/:id`, `POST`, `PUT`,
`DELETE`, `GET /certifications/expiring?days=N` (default 90), `POST /certifications/suggest`.
Status/expiration is computed at read time (effectiveStatus + daysUntilExpiration decorated onto
responses); the stored `status` stays the user lifecycle value — reads never mutate the record.

### NEEDS (non-blocking) — shared backend dependency for real Bedrock
`/certifications/suggest` must (per spec) call Bedrock. The shared backend bundle does **not** ship a
Bedrock client and `@aws-sdk/client-bedrock-runtime` is **not** in `backend/package.json` deps. That
file is a frozen/shared/foundational file — **out of my lane to edit.**

To stay in-lane and still ship a working endpoint, `/suggest` is built behind an **injectable
suggester seam** (`suggester.ts`) with a deterministic, career-goal-aware **curated** default,
grounded in the spec's named baseline (CNA, BLS/CPR, First Aid, Stop the Bleed) plus an ICU/critical-
care track unlocked by career-goal keywords. The Lambda role already has `bedrock:InvokeModel` and a
`BEDROCK_MODEL_ID` env var (api-stack), so the only missing piece is the SDK dependency.

**Ask:** supervisor (or whoever owns the shared backend `package.json`) add
`@aws-sdk/client-bedrock-runtime` to backend deps. Then a `makeBedrockSuggester()` drops into
`routes.manifest.ts` with **zero** handler/test changes (the seam is `Suggester = (input) => Promise<CertSuggestion[]>`).
Until then the curated suggester is the production default and the endpoint is fully functional.

## worker-2 @ 2026-06-06T18:05:00Z — PR #14 READY for review

`gh pr ready` done. Summary of what's in the PR:

**Backend** (`backend/modules/certifications/`): `schema.ts` (zod, `.strict()` bodies), `status.ts`
(pure expiration/status logic — `effectiveStatus`, `daysUntil`, `decorate`, `isExpiringWithin`,
90-day horizon), `suggester.ts` (injectable seam + curated default), `handlers.ts` (7 handlers +
`buildRoutes`), `routes.manifest.ts` (append-only, lazy data client).

**Frontend** (`frontend/src/modules/certifications/`): `types.ts`, `logic.ts` (status meta + tones,
countdown, sort, expiring filter, cost), `api.ts`, page + `CertificationCard` / `ExpiringWidget` /
`SuggestionsPanel` / `CertForm`, `nav.manifest.ts` (secondary nav, `certificate` icon, `/certifications`).

**Decisions a reviewer should sanity-check:**
- Status filter on `GET /certifications?status=` matches **effective** status (so an expiring `active`
  cert shows under `expiring-soon`, not `active`). Intentional — matches the badges.
- No training **progress bar**: the frozen `Certification` data type has `trainingHours` but no
  required/target-hours field, so a percentage would be fabricated. Card shows "Nh logged" instead.
  (If a progress bar is required, it needs a `trainingHoursRequired` field on the shared data type —
  a foundational change, out of my lane.)
- `renew` flow opens the edit form (where renewal requirements + new expiration/status live).

**Verification (local, this worktree):** `npm run typecheck` ✓ · `npx eslint <module paths>` ✓ ·
`npm run check:routes` ✓ (13 routes, 0 dup) · `vitest` ✓ **48 tests** (43 backend + 5 frontend logic).
No shared/foundational files touched; only owned module paths + the two append-only manifests.

---

## spec-reviewer @ 2026-06-06T17:18Z — PR #14 (head d56012f) — 🔴 CHANGES REQUESTED

Reviewed `feat/certifications` (+1785/-0, 20 files) against `specs/modules/certifications.md`.
Code quality, boundary, security, authz, config, and tests are strong — but the spec's named AI
acceptance criterion is unmet, plus two worker-actionable correctness items.

**No hard fails:** boundary clean (all within `backend/modules/certifications/**` +
`frontend/src/modules/certifications/**`, verified); no shared-contract edits; no
secrets/hardcoded model-id/table/account (data via `dataFromEnv()`); authz off the JWT (401 path
proven); no client-side Bedrock. Family-visible entity → no private path required (correct).
CI green; 48 tests pass.

### Required — worker-actionable (in your lane)

1. **[Correctness] `suggester.ts:115-119` — substring dedupe can over-filter.**
   `have.some((h) => h.includes(name) || name.includes(h))` lets a short/empty held-cert name match
   unrelated suggestions (`name.includes('')` is always true; "CPR" suppresses "BLS/CPR
   Certification"). Fix: guard short/empty `h` (e.g. require length ≥ 4) or compare normalized full
   names / a curated alias set.
2. **[Correctness/Completeness] `schema.ts:39` + `status.ts:31,36` — `expiring-soon`/`expired` are
   write-accepted but also derived, with no reconciliation.** A record stored with one of these
   passes through forever (`effectiveStatus` only overlays expiry onto stored `active`/`renewed`),
   so a stored `expired` never auto-recovers and a stored `expiring-soon` never recomputes. Fix:
   drop those two from the writable enum (let them be purely derived — the cleaner model the spec
   implies), or have `effectiveStatus` recompute from `expirationDate` for them too.

### Blocked on supervisor (NOT your fault — for tracking, do NOT edit the frozen bundle)

3. **[Completeness — acceptance L41 + §AI L31-32] `/certifications/suggest` does not call Bedrock.**
   Spec requires "suggestions" via Bedrock; the module ships a curated list behind an injectable
   seam because `@aws-sdk/client-bedrock-runtime` isn't in the (frozen) `backend/package.json` and
   there's no shared Bedrock helper. **You did the right thing** (seam + escalation; the curated
   list does satisfy the spec's named first-visit baseline at L27). This is the cross-cutting
   foundational gap escalated to the supervisor (see spec-reviewer.json `needs`). Once a shared
   `backend/shared/ai` Bedrock client lands (model id from env/SSM — `BEDROCK_MODEL_ID` already on
   the Lambda role), wire `makeBedrockSuggester()` into `routes.manifest.ts` + add a Bedrock-failure
   fallback test.

### For Grahem / supervisor (product decision)
- **Staged-AI call:** if Grahem accepts staged delivery, the supervisor MAY merge after items 1-2 are
  fixed, tracking item 3 (Bedrock) as a follow-up; otherwise hold for the shared client. Reviewer
  defers this gate to Grahem (spec wins unless Grahem says otherwise).
- **Training progress bar (acceptance L41 "training progress"):** worker correctly notes the frozen
  `Certification` type has `trainingHours` but no `trainingHoursRequired`, so a % bar would be
  fabricated → shows "Nh logged" instead. A real bar needs a shared-type field (foundational). Note
  for the supervisor whether that field should be added.

**Verdict: CHANGES REQUESTED** (items 1-2 now; item 3 pending the shared client + Grahem's staged
decision). ⚠️ Formal `--request-changes` impossible (self-PR under `grahem-wnu`); posted as a PR
**comment** — this checkpoint + comment are the signal.
