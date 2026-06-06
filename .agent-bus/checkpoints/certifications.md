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
