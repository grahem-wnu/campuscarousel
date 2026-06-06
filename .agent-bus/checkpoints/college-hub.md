# college-hub — checkpoint

## worker-2 @ 2026-06-06T19:40Z — claimed, draft PR #19

Claimed `college-hub` (wave 2, the data-heavy module) via atomic ref-create after `certifications`
merged (#14). Draft PR #19 → dev. Building against frozen shared contracts (consume-only):
`data.colleges` (hydratable, `mergePreservingUserEdits` preserves `userEdited[]`), `data.collegeNotes`,
`data.collegeChecklist`. Privacy: family-visible, no private fields; identity off the JWT, router 401s.

### NEEDS — two SHARED changes to complete ASYNC hydration (out of my lane)

The spec mandates async hydration via SQS (return job id / status, frontend polls). Two frozen pieces
are missing; I can build everything ELSE in-lane and seam the async so it drops in cleanly:

1. **`@aws-sdk/client-sqs` is not in `backend/package.json` deps.** Like the Bedrock dep you just
   added (bc27686), the enqueue side needs the SQS client. esbuild (build-lambda.mjs) has no
   `external` config, so I cannot even *reference* `@aws-sdk/client-sqs` (tsc + bundle both fail to
   resolve it) until it's a real dependency. **Ask:** add `@aws-sdk/client-sqs@^3.700.0` to backend deps.

2. **The worker bundle doesn't include module hydration handlers.** `backend/lambda/hydration.ts`
   exports an empty `hydrationRegistry` (comment: "real college/scholarship handlers register here
   when those modules land"), and `build-lambda.mjs` only globs `routes.manifest.ts` into the API
   bundle — nothing globs hydration handlers into the *worker* bundle. So a handler I register in my
   module never reaches the deployed worker. **Ask:** mirror the routes glob — have the build import
   each module's `hydration.manifest.ts` (exporting `{ type, handler }` or a `register(registry)`
   fn) into `backend/lambda/hydration.ts`, OR import college-hub's handler there directly. I will
   ship `backend/modules/college-hub/hydration.manifest.ts` in the expected shape; tell me the exact
   contract you want and I'll match it.

**What ships in PR #19 regardless (in-lane, tested):** all CRUD (list w/ filter/sort/search, get,
create→auto-hydrate-enqueue, put w/ userEdited, soft-delete→removed, top-pick), discover (Bedrock,
returns candidates, no auto-add), bulk-add, notes, checklist, comparison; the Bedrock **hydration
logic** (injectable, tested with a stub client) and the **worker handler fn** (tested). The enqueue
is behind an injectable seam: the production default is a safe no-op-with-status-set until the SQS
dep lands, then `makeSqsEnqueuer()` + the worker registration activate with zero handler/test changes.
Frontend: list (card/table), discovery flow, detail tabs (Overview/Notes/Checklist/Fit), compare,
branding+logo fallback. (Touchpoints/Visits/Benchmark tabs belong to their own modules.)

---

## worker-2 @ 2026-06-06T20:30Z — PR #19 READY for review

Full module shipped. typecheck ✓ · eslint ✓ · check:routes ✓ (35 routes/4 manifests) · vitest ✓
**56 tests** (49 backend + 7 frontend logic). In-lane only; no shared/foundational edits.

**Backend (14 endpoints):** GET/POST/PUT/DELETE colleges, PATCH top-pick, POST hydrate +
hydrate-all, POST discover, POST bulk-add, GET/POST notes, GET/PUT checklist. Pure list query
(filter/search/sort, removed hidden unless includeRemoved). Bedrock discovery + hydration
(injectable, graceful fallback → [] / hydrationStatus:'failed'). `mergePreservingUserEdits` keeps
user edits; create marks caller-supplied fields userEdited so auto-hydration can't clobber them.
Added **GET /colleges/:id/checklist** (read; PUT replaces) — needed for a usable checklist UI.

**Frontend:** list (card/table toggle, filter/sort/search), discovery flow (filters → candidates
w/ checkboxes → Add selected/all), detail (branded header + logo fallback chain, Overview/Notes/
Checklist/Fit tabs, edit/refresh/soft-delete), comparison (2–4 side by side + 4-yr budget),
hydration polling, nav manifest (list + hidden detail route). Touchpoints/Visits/Benchmark tabs
left to their owning modules (per spec boundary).

**ASYNC status — still needs the 2 shared changes above.** Hydration currently runs **inline**
(synchronous Bedrock within the 30s API request — works for single college + hydrate-all on a small
list) behind a `HydrationDispatcher` seam. The SQS worker handler (`hydration.ts` +
`hydration.manifest.ts`) and the message contract are built + tested, ready to activate the moment
(1) `@aws-sdk/client-sqs` is added to backend deps and (2) the worker build globs module hydration
handlers. Swapping inline→SQS is then a one-line change in routes.manifest. Reviewer: please confirm
whether to (a) wire those two shared pieces now (recommended — true async per spec, esp. hydrate-all),
or (b) accept inline for this PR and track async as a fast follow-up like the Bedrock dep.
