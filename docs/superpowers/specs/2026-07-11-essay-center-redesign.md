# Essay Center — no-tabs redesign + async evaluation

**Tier**: 3 (module shell rewrite + async evaluation job + small infra)
**Date**: 2026-07-11
**Status**: Design locked with Grahem (2026-07-11); pending written-spec sign-off
**Supersedes**: the UI/entry portions of `2026-07-10-essay-coach-practice-design.md` (the questions-first coach and async questions stay; the tabbed "Application Central" shell and the college-picker entry are replaced).

## Why
The shipped module diverged from intent. Grahem's correction: this is an **Essay Center**, not an application tracker. Drop the tabs, drop the college picker, make it a simple **college list → per-college essay view** with a back button. And the evaluation step needs a first-class **"Evaluate" button → a clear "evaluating, up to a minute" view** — which also means moving the review off the request path (it already runs ~17s on Sonnet, near the same 30s ceiling that broke the questions).

## Decisions (Grahem, 2026-07-11)
- **No tabs.** The module is a two-level flow: a **college list** (landing) and a **per-college essay view** reached by clicking a college's action, with a **← back to colleges**.
- **Rename** the user-facing module to **Essay Center** (nav label + page header). Internal identifiers (folder `application-central`, module id, DynamoDB prefixes) stay to avoid high-churn/risky renames — this is a display rename.
- **Remove** the Recommenders, Test scores, and Decisions tabs/views from this module (UI removed; their components deleted; backend endpoints left in place as out-of-scope future cleanup).
- **Remove** the college-picker tags, the "practice on a different school" search, and "general practice." Every essay is per-college; the college is always the one clicked.
- **College row actions:** **Start essay** (no attempts yet) or **Essays →** (has attempts). Start essay → straight into "searching for questions." Essays → → that college's **saved attempts + a "search for a new question"** button.
- **Evaluation is async** (job + poll), like the questions, with a dedicated running view: *"Evaluating your essay — this can take up to a minute."*
- **Queue starvation fix:** practice-question + evaluation jobs must not get stuck behind ~140s web-grounded focus jobs (staging investigation flagged this). Give the essay-coach jobs their own SQS lane.

## Flow (the whole module)

```
Essay Center
├─ College list  (landing; each college → "Start essay" or "Essays →")
└─ Essay view for <college>   [← back to colleges]
   ├─ (Essays → entry) Attempts list: this college's saved practice essays + [Search for a new question]
   ├─ Searching…      "Looking for practice questions for <College>…"   (async questions job, polled)
   ├─ Questions       cards (question / why / tip), each → [Write about this one]
   ├─ Writing         chosen question up top + editor + [Evaluate]   ([← back to questions])
   ├─ Evaluating…     dedicated view: "Evaluating your essay — this can take up to a minute."  (async review job, polled)
   └─ Result          rubric bars + score + verdict + strengths/improvements + "never a rewrite"
                      + [Back to editing] (revise → Evaluate again — the loop)
```

No roster/picker anywhere in the essay view. The disclosure banner (real vs generic questions) still applies inside "Questions."

## Architecture

### Frontend (the bulk)
`frontend/src/modules/application-central/`:
- **`EssayCenterPage.tsx`** (rename of `ApplicationCentralPage.tsx`): owns the top-level state `{ view: 'colleges' | 'essay', college?: {id?, name} }`. Renders the **college list** or the **essay view**. No `Tabs`. Header reads "Essay Center". Removes all imports/usage of `RecommendationBoard`, `TestScoreTracker`, `DecisionMatrix`, `Tabs`, and the picker/modal.
- **College list**: reuse `ApplicationOverview`'s per-college rows (the list "looks correct"), simplified to two actions — `onStartEssay(college)` and `onOpenEssays(college)` — no deadline/exam columns needed for the essay-first framing (keep the college name + a status hint; trim the rest if it's noise). Each row routes into the essay view with that college.
- **`CollegeEssayView.tsx`** (new; replaces `EssayCoachStart`): given a fixed `{ collegeId?, collegeName }`, manages the sub-states **attempts → searching → questions → writing → evaluating → result**. No picker. On "Start essay" it goes straight to `searching`; on "Essays →" it starts on `attempts`. Owns "← back to colleges" and "← back to questions". Uses the existing async `startPracticeQuestions`/`getPracticeQuestionJob` poll (unchanged) for the searching state, with clear copy.
- **`EssayWorkspace.tsx`** (adapt): the writing surface. Rename the sidebar review button to **"Evaluate"**; clicking it enters a dedicated **evaluating view** (not the inline sidebar) that clearly shows progress + the "up to a minute" bound, then renders the **result** view (the existing rubric render, moved into its own panel) with **Back to editing**. Keep "Find relevant experiences," Save draft, Copy essay, Mark final. Evaluation now goes through the async start+poll pair.
- **Delete**: `RecommendationBoard.tsx`, `TestScoreTracker.tsx`, `DecisionMatrix.tsx` (+ their tests) from this module's UI. Leave `api.ts` recommender/test-score/decision functions unused for now (or trim — see Out of scope).
- **`api.ts`**: add `startEssayEvaluation(essayId, {content, targetWords})` → POST (202 job) and `getEssayEvaluationJob(jobId)` → GET poll; the old synchronous `reviewEssay` is replaced.
- **`nav.manifest.ts`**: `label: 'Essay Center'` (keep `id`/`route` to avoid breaking links, or switch `route` to `/essays` — see Open question O1).

### Backend — async evaluation (mirror the practice-questions job)
`backend/`:
- **`EssayReviewJob`** data type (`shared/data/types.ts`) + repo (`shared/data/index.ts`, prefix `ESSAYREVIEW`, idField `jobId`): `{ jobId, essayId, content?, targetWords?, status: 'pending'|'complete'|'failed', result?: EssayReview, error? }`. `EssayReview` is fully JSON-serializable (primitives/arrays + the `rewrote: false` literal), so it stores on `result` as-is.
- **`review.ts`** (new in `application-central`, mirrors `practice.ts`): `runReviewJob(getData, reviewer, now, jobId)` — read job → load essay for `prompt`/`collegeId` → `gatherCollegeContext` → `makeBedrockEssayReviewer` → write `result`/`failed`; **and persist the compact `lastReview` on the essay** when `source==='ai' && overall!==undefined && verdict!==undefined`, exactly as the current sync handler (`handlers.ts:209-219`). Note: `runReviewJob` needs a clock for `reviewedAt` (thread `now`, default `() => new Date()`). The new "evaluate the editor buffer" flow always passes `content`, so (as today) `reviewedDraft` is undefined and `lastReview.version` is omitted — behavior unchanged. Inline dispatcher, worker handler, SQS enqueuer.
- **Handler**: replace the sync `review` with `startReview` (POST `/essays/:id/review` → create `EssayReviewJob` pending with `essayId`+`content`+`targetWords`, dispatch, re-read, **202**) + `reviewStatus` (GET `/essays/:id/review/:jobId` → poll; validate with `jobIdParamSchema` and look up by the globally-unique `jobId`, ignoring `:id`). The `lastReview` persistence moves entirely into the worker path.
- **ONE manifest, sub-routed by `kind` (follow the `focus` precedent — the build globs exactly one `hydration.manifest.ts` per module; a second file or an array export is NOT supported by `build-lambda.mjs`/`buildRegistry`).** Consolidate both async jobs under a single registered worker type `ESSAY_COACH_TYPE = 'essay-coach'`. The manifest handler dispatches on a `kind` field: `kind === 'review'` → the review worker handler; else (`'questions'`) → the practice worker handler. This requires updating `practice.ts` so its message is `{ type: 'essay-coach', kind: 'questions', jobId, tenantId, studentId }` (rename `PRACTICE_QUESTIONS_TYPE`→ the shared `ESSAY_COACH_TYPE`, add `kind`); the review enqueuer sends `{ type: 'essay-coach', kind: 'review', ... }`. Data repos stay separate (`practiceQuestionJobs` + `essayReviewJobs`); only the SQS message family + manifest unify. *(No in-flight `practice-questions`-typed messages survive the deploy meaningfully on staging.)*
- **Dedicated queue lane** (`infra/lib/async-stack.ts` + `api-stack.ts` + `bin/infra.ts`) — **recommended and adopted**: add `${prefix}-essay-coach` queue + DLQ + worker (shared `backend/dist/hydration` bundle, `BEDROCK_MODEL_ID` env, 300s timeout, `reservedConcurrentExecutions: 5`; model-only, so no `AI_WEB_SEARCH`/Tavily SSM needed). Thread the queue from `AsyncStack` (public readonly field) → `ApiStack` props via `bin/infra.ts`, `grantSendMessages(routing)` + `ESSAY_COACH_QUEUE_URL` env on the routing Lambda — mirroring the focus/assets lanes exactly. Reserved-concurrency budget: 10+3+5 = 18, far under the 1000 pool.
- **Repoint BOTH enqueuers** to prefer the new lane: `makeSqsPracticeEnqueuer` (questions, `practice.ts`) AND the new review enqueuer use `ESSAY_COACH_QUEUE_URL ?? FOCUS_QUEUE_URL ?? HYDRATION_QUEUE_URL`. If only the review enqueuer moves, questions stay starvable on the focus lane — both must move.

### Poll bounds
- Questions: existing `POLL_MS=3000`, `MAX_POLLS=40` (~120s) — keep as-is (generation ~25–40s; the dedicated lane removes the starvation risk, so no need to change).
- Evaluation: `POLL_MS=3000`, `MAX_POLLS=30` (~90s) — review ~15–20s; the "up to a minute" copy sets expectation with headroom. On timeout: a clear "taking longer than expected — try again."

## API contract (new/changed)
- `POST /essays/:id/review` → **202** `EssayReviewJob` (was 200 + `{review, essay}`).
- `GET /essays/:id/review/:jobId` → `EssayReviewJob` (poll; 404 if missing).
- `POST /essays/practice-questions` / `GET /essays/practice-questions/:jobId` — unchanged (already async; only the worker message `type`/`kind` changes internally).
- Route-shadow check: `GET /essays/:id/review/:jobId` is **4 segments** (the first 4-seg route in the module — confirm the router matcher isn't depth-capped; it already handles 3-seg two-static and 3-seg one-param, so 4-seg two-param is one more split). No conflict with the 3-seg `POST /essays/:id/review`. Keep routes.manifest ↔ `buildRoutes` ↔ `manifest.test` in sync, and update **both** `manifest.test` assertions (the auto buildRoutes-parity test AND the hardcoded endpoint list).

## Testing
- **Backend unit**: `review.ts` job (complete persists `lastReview`; failed; enqueuer fallback + message shape) mirroring `practice.test.ts`; handler 202 + status + 404 + 422; the shared-worker manifest registers `essay-review` (barrel + no duplicate type). Queue/infra: a synth/assertion test if the stacks have them.
- **Frontend**: `CollegeEssayView` — Start essay → searching → questions render → "Write about this one"; Essays → → attempts list + "new question"; back navigation. `EssayWorkspace` — "Evaluate" → evaluating view shown → result renders (poll-path test with fake timers, per the questions pattern) → "Back to editing"; never-a-rewrite intact. `EssayCenterPage` — college list renders, no tabs, header "Essay Center". Delete the three removed components' tests.
- **Manual/staging E2E**: college list → Start essay on a roster college → clear "searching" state → questions → write → **Evaluate** → clear "evaluating, up to a minute" view → rubric result → back to edit → re-evaluate → back to colleges. Confirm the essay-coach jobs run on the new lane (not starved). Both real-prompt (no banner) and generic (banner) paths.

## Resolved decisions
- **O1 — route path → `/essays`** (Grahem, 2026-07-11). Update `nav.manifest.ts` `route: '/essays'` and any internal links; staging-only so a broken `/applications` bookmark is acceptable.
- **O2 — college list → trimmed, essay-focused** (Grahem, 2026-07-11). Each row = college **name** + a hint like **"N practice essays"** (0 → nudge to start) + the **Start essay / Essays →** action. Drop the deadline/exam/status columns. Build a lean `CollegeEssayList` (new component, not `ApplicationOverview`, which is deadline/exam-framed). **Iterate `listCollegeOptions()` as the spine** (so zero-essay colleges appear with "Start essay"), and count per `collegeId` from `listEssays()` (via `groupEssaysByCollege`). Any legacy essay with no `collegeId` (from the removed general-practice path) should be bucketed under its `collegeName` or dropped from the list — don't let it render as a phantom college.

## Out of scope
- Renaming the folder/module id/DynamoDB prefixes (display-only rename).
- Deleting the backend recommenders/test-scores/decisions endpoints + their `api.ts` clients (leave dead; separate cleanup).
- Converting the essay **question generation** — already async; only its entry UI changes.
- Prod/`main` — unchanged; Grahem's call.
