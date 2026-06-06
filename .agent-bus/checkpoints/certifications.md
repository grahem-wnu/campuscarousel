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

## infra @ 2026-06-06T17:35Z — Bedrock dep PROVIDED (PR #17)
The ask is done: `@aws-sdk/client-bedrock-runtime` is in `backend/package.json` (PR #17, awaiting
supervisor merge). After merge, `makeBedrockSuggester()` drops into `routes.manifest.ts` behind the seam.

---

## worker-2 @ 2026-06-06T18:35Z — review items 1-2 ADDRESSED (PR #14 @ 51c874c)

Rebased onto origin/dev (4ec4c04 — DNS PR #12; no shared backend/AI change). Both worker-actionable
items fixed; item 3 (Bedrock) stays supervisor-blocked (still no shared AI client in dev).

1. **Dedupe over-filter — FIXED.** `suggester.ts` no longer substring-matches. New model: each
   curated entry has internal `aliases` (e.g. bls/cpr/acls); a held cert matches only when one
   non-empty *significant-token* set (stopwords like "certification" removed) is a subset of the
   other (`sameCert`). `name.includes('')` bug gone; blank/generic/unrelated held names don't
   suppress the baseline; "BLS/CPR" no longer cross-matches "ACLS". Aliases stripped from the API
   response (`toSuggestion`). New tests: blank/generic/unrelated guards, cross-match, alias-leak.

2. **Derived statuses — FIXED (both belt + suspenders).** `expiring-soon`/`expired` removed from the
   WRITABLE enum → create/update **422** them (new `WRITABLE_CERT_STATUSES`; list filter still
   accepts all six against effective status). AND `effectiveStatus` now recomputes every
   expiry-derived state from `expirationDate`, so a stale stored `expired` reconciles (renewed →
   active) and an aging `active` rolls into expiry. Frontend form offers writable statuses only.
   New tests: reconciliation cases + create-rejects-derived-status (422).

**Verification:** typecheck ✓ · eslint ✓ · check:routes ✓ (13 routes) · vitest ✓ **53 tests**
(48 → 53). In-lane only; no shared/foundational edits. Heartbeat → waiting-review. Re-review please.

---

## spec-reviewer @ 2026-06-06T17:42Z — PR #14 round 2 (head 51c874c) — 🟡 CHANGES REQUESTED (narrowed)

Re-reviewed the delta `d56012f..51c874c` (three-dot boundary clean — only certifications trees; the
infra/* files in the two-dot delta are just dev catching up via your rebase, not your edits). CI green.

**Both worker-actionable items: FIXED — verified, and better than I asked. Nice work.**
1. **Dedupe over-filter ✓** — `suggester.ts` now uses significant-token sets + internal aliases with
   a subset match (`sameCert`), stopwords removed, aliases stripped from the API response. The
   `name.includes('')` bug is gone; blank/generic/unrelated held names no longer suppress the
   baseline; "BLS/CPR" no longer cross-matches "ACLS". New tests cover blank/generic/unrelated/cross/
   alias-leak.
2. **Writable derived statuses ✓** — belt-and-suspenders: `WRITABLE_CERT_STATUSES` makes create/
   update 422 a derived status, AND `effectiveStatus` now recomputes every expiry-derived state from
   `expirationDate` so a stale stored `expired` reconciles. New tests cover both. This even closes
   the edge I noted (stored `expired` never auto-recovering).

### One remaining item — the blocker has LIFTED (please re-read)

3. **[Completeness — acceptance L41 + §AI L31-32] Wire the real Bedrock suggester — now in-lane.**
   Your note says item 3 "stays supervisor-blocked (still no shared AI client in dev)." That's no
   longer accurate: **`@aws-sdk/client-bedrock-runtime ^3.700.0` is now on `dev`'s
   `backend/package.json`** (the dep landed; PR #17's body confirms "a module can drop a real
   Bedrock-backed suggester into its `routes.manifest.ts`"). You do NOT need a shared `backend/shared/ai`
   helper to proceed — import the SDK **directly in your own module** (`suggester.ts` /
   `routes.manifest.ts`), build a `BedrockRuntimeClient` + `InvokeModelCommand`, take the model/
   inference-profile from the **`BEDROCK_MODEL_ID` env var** (already set on the Lambda role — do NOT
   hardcode it), parse the response, and **fall back to `curatedSuggester` on any error/timeout**.
   Add a Bedrock-failure→fallback test. Also update the now-stale header comment in `suggester.ts`
   (it still says the dep isn't a backend dependency).
   - This is the path to meeting the spec; the seam you built makes it the few lines you described.
   - **Grahem/supervisor override:** if Grahem prefers to ship staged (your curated default already
     satisfies the spec's named first-visit baseline at L27 as a graceful fallback) and wire Bedrock
     as a fast follow-up, the supervisor may merge as-is — reviewer is fine with either. If you'd
     rather wait for that ruling than wire it now, say so here and the supervisor will decide.

**Verdict: CHANGES REQUESTED**, narrowed to item 3 (now unblocked + in-lane) — items 1-2 cleared.
Not auto-mergeable as spec-complete until Bedrock is wired OR Grahem signs off on staged delivery.
⚠️ Formal review impossible (self-PR under `grahem-wnu`); posted as a PR **comment**.

---

## worker-2 @ 2026-06-06T19:10Z — item 3 (real Bedrock) WIRED — PR #14 @ 10a70f5

Reviewer was right: the blocker lifted. `@aws-sdk/client-bedrock-runtime ^3.700.0` is on dev's
`backend/package.json` (bc27686). Rebased onto origin/dev and wired the real suggester **in-lane**
(no shared AI helper needed):

- `suggester.ts` → `makeBedrockSuggester(options)`: lazy-imports the SDK (keeps cold start lean for
  non-suggest requests), builds `InvokeModelCommand` with model id from **`BEDROCK_MODEL_ID`** (env,
  never hardcoded), sends an Anthropic-messages request, extracts + JSON-parses the model's array,
  validates each item, dedupes against held certs (token/alias), priority-sorts. **Falls back to
  `curatedSuggester` on ANY** error/timeout/empty/malformed/no-model-id — `/suggest` never throws.
- `routes.manifest.ts` wires `makeBedrockSuggester()` for production. Handlers keep `curatedSuggester`
  as the injected default, so handler/router/manifest tests are unchanged (deterministic, no network).
- Header comment updated (no longer says the dep is missing).

**Tests:** +5 (parse/validate/dedupe/sort; fallback on no-array / empty-array / client-throw /
no-model-id) → **58 total**. typecheck ✓ · eslint ✓ · check:routes ✓ (21 routes/3 manifests) · vitest ✓.

All three review items now addressed (1 dedupe, 2 derived-status, 3 Bedrock). In-lane only; no
shared/foundational edits. Heartbeat → waiting-review. Believe this is spec-complete — re-review please.
