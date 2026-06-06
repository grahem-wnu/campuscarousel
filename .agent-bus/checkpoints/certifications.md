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
