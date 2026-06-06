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

---

## spec-reviewer @ 2026-06-06T19:14Z — PR #19 (head 7abfe78) — 🔴 CHANGES REQUESTED

Reviewed `feat/college-hub` (+3020/-0, 26 files — largest module yet) against
`specs/modules/college-hub.md`. Excellent, thorough module; one mandated-architecture gap that is
blocked on two foundational pieces you correctly escalated. Answering your (a)/(b) question: **(a)** —
the spec + CLAUDE.md mandate SQS-async hydration, so we wire the two shared pieces and flip, rather
than merge inline.

**No boundary/security/contract hard fails (verified myself):**
- Three-dot boundary strictly within `backend/modules/college-hub/**` + `frontend/src/modules/college-hub/**`.
- Authz off the JWT on every route (401 proven); `addedBy`/note `author` server-set (note: `noteSchema`
  lets a client override `author` — harmless family-visible, but consider dropping it).
- Bedrock fully server-side; model/inference-profile from `process.env.BEDROCK_MODEL_ID` (throws if
  unset — never hardcoded; `ai.ts:46`); graceful fallback (discover→[], hydrate→`failed`);
  `pickHydratableFields` allowlist means AI can't set `status`/`isTopPick`/`collegeId`/`userEdited`
  (tested). No secrets/queue-url/table/account hardcoded. Single-table only; `College` type is the
  frozen shared one; sub-entities under `COLLEGE#<id>` — stable downstream contract. Nav `primary` is
  CORRECT here (Colleges is one of the 5 design-system primary tabs). Frontend HAS a poll-until-
  terminal loop (`CollegeHubPage.tsx:81-85`, `setTimeout(refresh,4000)` while `anyHydrating`). Strong tests.

### BLOCKED ON SUPERVISOR/INFRA — async hydration (the mandated architecture; ESCALATED)
Hydration currently runs **synchronously inline** (Bedrock within the API request): `create`/`hydrate`
`await dispatch` one model call; **`hydrate-all` loops `await dispatch` per college (handlers.ts:143-144)
= N serial Bedrock calls → will exceed the API Gateway 29s timeout for more than ~2-3 colleges.** Spec
("AI behavior": async via SQS, return job id, poll status) + CLAUDE.md require SQS-async. The async
infra is already deployed on dev (`async-stack.ts` queue+DLQ+300s/batchSize-1 worker; `api-stack.ts:62,74`
injects `HYDRATION_QUEUE_URL` + grants SendMessages), BUT the enqueue + worker paths need two
**out-of-lane frozen** changes you correctly raised (Bedrock-dep precedent), which I'm escalating:
  1. Add **`@aws-sdk/client-sqs@^3.700.0`** to `backend/package.json` (you can't even reference the SDK until then).
  2. Extend **`backend/scripts/build-lambda.mjs`** to glob each module's `hydration.manifest.ts` into
     the worker bundle's `hydrationRegistry` (today it only globs `routes.manifest.ts`, so an enqueued
     `college-hydrate` message reaches no handler → DLQ).
Once both land, flip `routes.manifest.ts` inline→`makeSqsEnqueuer()` (your seam + worker handler +
message contract are built and tested) and `create`/`hydrate`/`hydrate-all` enqueue + return 202
immediately — the frontend poll loop already surfaces the result. **This is the path to spec-compliance.**

### Required — worker-actionable (in your lane, do alongside the flip)
1. **[Completeness] No duplicate-college guard** — `handlers.ts` `create` (~84-96) and `bulkAdd`
   (~155-170) create a new `COLLEGE#<id>` even if the same school (by normalized name) is already
   tracked; `DiscoverPanel` can re-add an already-tracked candidate. Fix: skip/merge on normalized-name
   match (or 409), and filter discovered candidates already tracked before pre-selecting.

### For Grahem / supervisor (product decisions)
2. **Web-search tool is NOT enabled** — `invokeText` sends a plain Messages call with no `tools`, so
   discovery/hydration rely on model general knowledge, not live web search (documented gap, parallel to
   certifications). **This matters more here**: college-hub's whole value is fetching real, current
   college data — general-knowledge hydration risks stale/inaccurate facts. Decide whether to wire the
   web-search tool (likely a shared AI capability) before this module is relied upon, or accept it for now.
3. **Deferred detail tabs** (Essays/Touchpoints/Visits/Benchmark) are left to the wave-3 modules
   co-owning `COLLEGE#<id>` — confirm this is the intended seam, not a silent drop.

**Verdict: CHANGES REQUESTED.** Primary unblock is the supervisor/infra (2 pieces above) → then your
one-line SQS flip; plus the dedup guard. Module quality is otherwise high and spec-conformant.
⚠️ Formal `--request-changes` impossible (self-PR under `grahem-wnu`) → this checkpoint + the PR
comment are the signal.

---

## worker-2 @ 2026-06-06T21:05Z — review item ADDRESSED (dedup guard); PR #19 @ 463069d

Spec-reviewer CHANGES-REQUESTED (head 7abfe78) — thank you. Items handled:

**[REQUIRED, worker-actionable] Duplicate-college guard — DONE.** `create` → **409** when an active
college with the same normalized name (trim/lower/collapse-ws) already exists; `bulk-add` skips dups
(vs tracked list + within the batch) → `{created, skipped}`; discovery panel hides already-tracked
candidates (with a hidden-count note). Soft-deleted names re-addable. New `dedupe.ts` + tests; handler
tests for 409 + skip; frontend `normalizeName`/`untrackedCandidates` + tests. **65 tests** green;
typecheck/lint/check:routes clean.

**[Primary, BLOCKED ON SUPERVISOR/INFRA] SQS-async flip — agreed (your option a).** Needs the two
out-of-lane frozen changes (still NOT on dev): (1) `@aws-sdk/client-sqs` in backend deps; (2)
`build-lambda.mjs` globbing each module's `hydration.manifest.ts` into the worker `hydrationRegistry`.
My seam (`HydrationDispatcher`) + worker handler (`hydration.ts`/`hydration.manifest.ts`) + message
contract (`{type:'college-hydrate',collegeId}`) are built/tested. The moment both land I flip
`routes.manifest.ts` inline→`makeSqsEnqueuer()` (return 202 immediately; frontend poll already
surfaces results) + add the enqueue test — one-line dispatcher swap, zero handler/test churn.

**[FOR GRAHEM/SUPERVISOR] noted, not my action:** (2) web-search tool not wired (model general
knowledge only — likely a shared AI capability); (3) Essays/Touchpoints/Visits/Benchmark detail tabs
deferred to the wave-3 modules co-owning COLLEGE#<id>.

Heartbeat → waiting-review. Re-review please.

---

## spec-reviewer @ 2026-06-06T19:31Z — PR #19 round 2 (head 463069d) — 🟡 CHANGES REQUESTED (narrowed; ball is in supervisor's court)

Re-reviewed delta `7abfe78..463069d` (three-dot boundary still clean — only college-hub trees). CI green.

**Worker-actionable item 1 (duplicate-college guard) — FIXED, verified:**
`dedupe.ts` (`normalizeCollegeName` trim/lower/collapse; `findActiveByName` ignores `removed` so a
name can be re-added after soft-delete). `create` → **409** on an active-name clash; `bulkAdd` dedupes
against tracked **and** within the batch (Set), returns `{ created, skipped }`; `DiscoverPanel` filters
already-tracked candidates. Tested (dedupe.test, handlers.test, logic.test). Clean.

**Sole remaining item — async hydration — BLOCKED ON SUPERVISOR/INFRA (no further worker action possible):**
Hydration is still synchronous inline because the two out-of-lane frozen pieces aren't on dev yet:
  1. `@aws-sdk/client-sqs` not in `backend/package.json` (worker can't even reference the SDK to write
     the dispatcher until it's a dep);
  2. `backend/scripts/build-lambda.mjs` still globs only `routes.manifest.ts`, not module
     `hydration.manifest.ts` → an enqueued message would reach no worker handler.
The SQS seam + worker handler + message contract are built and tested; the moment those two land, the
worker flips `routes.manifest.ts` inline→`makeSqsEnqueuer()` (one line) and it's spec-compliant async.
**Worker: nothing to churn here — stand by until the supervisor lands the 2 pieces, then do the flip.**

Still for Grahem (unchanged): (2) web-search tool not enabled (matters most for college-hub data
accuracy); (3) deferred Essays/Touchpoints/Visits/Benchmark tabs → wave-3 seam.

**Verdict: CHANGES REQUESTED — narrowed to async hydration, which is 100% a supervisor/infra unblock
(the 2 foundational pieces) + a subsequent one-line worker flip. Dedup guard cleared. Not spec-complete
(sync hydration violates the mandated async architecture), so not mergeable as-is — but the worker has
done everything in-lane.** ⚠️ Self-PR under `grahem-wnu` → checkpoint + PR comment are the signal.

---

## worker-2 @ 2026-06-06T22:20Z — SQS dep landed (deliverable 1); manifest contract aligned; PR #19 @ a4dc3ce

`@aws-sdk/client-sqs` is now on dev (foundational-hydration-bundle, 9401837). Rebased feat/college-hub
onto dev. **Not flipping to SQS yet** — hydration-bundle deliverables 2-3 (build-lambda.mjs hydration
glob + lambda/hydration.ts registry populate) are still pending, so an enqueued message would reach an
empty registry and DLQ. Inline hydration stays (it works) until the worker side lands. Per my own loop
gate and the reviewer's "flip when BOTH land."

**Done now to de-risk the foundational glob:** `backend/modules/college-hub/hydration.manifest.ts` now
exports `hydrationHandlers: Record<string, HydrationHandler>` (message `type` → handler) — the exact
worker-registry shape, so the build can `Object.assign(hydrationRegistry, hydrationHandlers)` and fail
loudly on duplicate types. `hydration = { type, handler }` kept as an alias. (HydrationHandler =
`(payload:unknown)=>Promise<void>`, matching backend/lambda/hydration.ts.)

**The flip, ready for when deliverables 2-3 land:** add `makeSqsEnqueuer()` (lazy-import
@aws-sdk/client-sqs, read `HYDRATION_QUEUE_URL`, send `{type:'college-hydrate',collegeId}`) + swap
routes.manifest's dispatcher inline→SQS (hydrate sets hydrationStatus 'in-progress', enqueues, returns
202; frontend poll already surfaces results) + an enqueue test with a stub SQS client. Small, contained.

typecheck ✓ · eslint ✓ · college-hub hydration+manifest tests ✓ (7).

---

## worker-2 @ 2026-06-06T22:55Z — ASYNC FLIP DONE (spec-complete) — PR #19 @ 9e78d9b

The hydration-bundle worker glob (#23) landed + `@aws-sdk/client-sqs` is on dev → flipped college-hub
hydration **inline → SQS async**, the mandated architecture:
- `enqueue.ts` → `makeSqsEnqueuer(getData)`: lazy-imports `@aws-sdk/client-sqs`, reads
  `HYDRATION_QUEUE_URL`, sends `{ type: 'college-hydrate', collegeId }`. `routes.manifest.ts` wires it
  as the hydration dispatcher (the one-line swap).
- `POST /hydrate`, `/hydrate-all`, and auto-hydrate-on-create now **enqueue + return immediately**
  (`hydrationStatus: 'in-progress'`, 202); the 300s worker does Bedrock; frontend poll surfaces it.
  **Fixes the hydrate-all 29s-timeout** the reviewer flagged (N fast enqueues, not N serial Bedrock).
- `hydration.manifest.ts` simplified to `export const hydration = { type, handler }` — exactly the
  landed `HydrationRegistration` the glob imports (worker registers `college-hydrate` → our handler).
- Safety net: enqueuer falls back to inline hydration if the queue is unavailable (never hard-fails).

`enqueue.test.ts` (+3): sends correct message; falls back on missing queue url; falls back on send
error. Rebased on dev. typecheck ✓ · eslint ✓ · check:routes ✓ (58 routes/8 manifests) · vitest ✓ 59.

All review items now resolved (dedup guard + async). Believe spec-complete → re-review → merge
unblocks course-planner. PR comment posted.

---

## spec-reviewer @ 2026-06-06T21:24Z — PR #19 round 3 (head 9e78d9b) — ✅ APPROVED

The async flip is done and CI is now green (ci=SUCCESS). Re-reviewed delta `a4dc3ce..9e78d9b`
(three-dot boundary clean — only college-hub trees).

- **Async hydration wired ✓** — `enqueue.ts/makeSqsEnqueuer`: queue url from `process.env.HYDRATION_QUEUE_URL`,
  lazy `SQSClient` + `SendMessageCommand`, enqueues the `college-hydrate` job and returns immediately;
  **falls back to the inline dispatcher** if the queue is unset/unavailable/send-fails (so `/hydrate`
  is never hard-broken). `routes.manifest.ts` now wires `dispatch: makeSqsEnqueuer(getData)`.
- **Worker seam matches the landed #23 build-glob ✓** — `hydration.manifest.ts` exports
  `export const hydration = { type: 'college-hydrate', handler }` (a `HydrationRegistration`), which
  `build-lambda.mjs` now globs into the worker `hydrationRegistry`. So enqueue→worker→Bedrock hydrate
  →terminal status is live end-to-end. Tests added (`enqueue.test.ts`).
- Round-2 dedup guard + earlier privacy/boundary/Bedrock verification all stand.

For-Grahem (non-blocking, standing): web-search tool still not wired (general-knowledge hydration).

**Verdict: APPROVED — clean + green, spec-complete (async hydration per the mandated architecture).**
This was the last wave-2 module needing approval. ⚠️ Formal `--approve` impossible (self-PR under
`grahem-wnu`) → checkpoint + PR comment are the merge signal. Supervisor to merge. I do not merge.
