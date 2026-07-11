# Essay Center Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the tabbed "Application Central" into a no-tabs **Essay Center**: a college list → per-college essay view (searching → questions → write → **Evaluate** → result), with evaluation moved to an async job + "up to a minute" view, on a dedicated SQS lane so nothing starves.

**Architecture:** Frontend shell rewrite (remove tabs/picker/3 dead tabs, rename, list↔detail). Backend: consolidate both async jobs (questions + review) under ONE worker type `essay-coach` sub-routed by a `kind` field (the build globs one manifest per module — follow the `focus` precedent); add async **evaluation** mirroring the shipped async **questions**. Infra: a dedicated `essay-coach` queue+worker; repoint BOTH enqueuers to it. Spec: `docs/superpowers/specs/2026-07-11-essay-center-redesign.md`.

**Tech Stack:** TS end-to-end; Zod; DynamoDB single-table (`makeDetailsRepo`); SQS worker via `hydration.manifest.ts` glob + `kind` sub-routing; AWS CDK; Vitest + RTL (jsdom). **Template to copy:** `backend/modules/application-central/practice.ts` + `practice.test.ts` (the questions job), `infra/lib/async-stack.ts` focus lane (~225-282), `frontend/src/modules/certifications/CertGuidanceSection.tsx` (start+poll).

**Conventions:** AWS `--profile wnu`, `us-east-2`; confirm account `010928187255` before any deploy. Tests from repo ROOT (`cd /mnt/c/Keira/keiras-journey && npx vitest run <path> --exclude '**/agents/**'`); typecheck from workspace dir; `npm run check:routes` from root. Every commit green. Branch `feat/essay-center-redesign` (off dev). No `npm install`; revert `.gitignore`/`.gstack` churn before committing.

---

## Chunk A: Backend — consolidate worker type + async evaluation

### Task A1: Consolidate to `ESSAY_COACH_TYPE` + `kind` (questions path)
**Files:** `backend/modules/application-central/practice.ts`, `practice.test.ts`

- [ ] **Step 1:** In `practice.ts`, rename the message family and add a `kind`:
```typescript
export const ESSAY_COACH_TYPE = 'essay-coach';
export interface PracticeQuestionMessage { type: typeof ESSAY_COACH_TYPE; kind: 'questions'; jobId: string; }
```
In `makeSqsPracticeEnqueuer`, the `MessageBody` becomes `{ type: ESSAY_COACH_TYPE, kind: 'questions', jobId, tenantId: currentTenantId(), studentId: currentStudentId() }`, and the default `queueUrl` becomes `process.env.ESSAY_COACH_QUEUE_URL ?? process.env.FOCUS_QUEUE_URL ?? process.env.HYDRATION_QUEUE_URL`. `makeWorkerHandler` stays keyed by `jobId` (it's invoked by the manifest only for `kind:'questions'`). Keep `runPracticeJob`/`makeInlineDispatcher` unchanged.
- [ ] **Step 2:** Update `practice.test.ts` enqueuer tests: assert the `MessageBody` now parses to `{ type: 'essay-coach', kind: 'questions', jobId, tenantId, studentId }`, and set `options.queueUrl` explicitly so it doesn't depend on env.
- [ ] **Step 3:** `cd backend && npx tsc --noEmit`; `cd /mnt/c/Keira/keiras-journey && npx vitest run backend/modules/application-central/practice.test.ts --exclude '**/agents/**'` → PASS.
- [ ] **Step 4:** Commit: `refactor(essay-center): unify async worker type to 'essay-coach' with kind='questions'`

### Task A2: `EssayReviewJob` type + repo
**Files:** `backend/shared/data/types.ts`, `backend/shared/data/index.ts`
- [ ] **Step 1:** In `types.ts`, near the other `*Job` types:
```typescript
/** Async essay-evaluation job. The review runs ~15-20s on Sonnet (near the request-path ceiling), so
 *  it runs on the essay-coach worker and the frontend polls. PK=ESSAYREVIEW#<jobId>. */
export interface EssayReviewJob extends Timestamped {
  jobId: string;
  essayId: string;
  content?: string;
  targetWords?: number;
  status: 'pending' | 'complete' | 'failed';
  result?: EssayReview;   // fully JSON-serializable
  error?: string;
}
```
`EssayReview` is already exported from data types? It lives in `application-central/ai.ts`. Add a structural copy to `types.ts` OR import shape — simplest: define `EssayReview` fields inline as the `result` type is only read via the FE type. **Check** whether `EssayReview` is re-exported from `shared/data`; if not, declare a `PersistedEssayReview` interface in `types.ts` mirroring `ai.ts:58-71` (strengths/improvements/authenticity/ratings?/overall?/verdict?/wordCount/onTarget/rewrote:false/source) and use it as `result`.
- [ ] **Step 2:** In `index.ts`: `const essayReviewJobs = makeDetailsRepo<EssayReviewJob, 'jobId'>(client, { prefix: 'ESSAYREVIEW', idField: 'jobId' });` + expose in the return; add only `EssayReviewJob` to the top `import type` list (mirror `PracticeQuestionJob`).
- [ ] **Step 3:** `cd backend && npx tsc --noEmit` → PASS. Commit: `feat(essay-center): EssayReviewJob record type + repo`

### Task A3: `review.ts` — evaluation job core (mirror practice.ts)
**Files:** Create `backend/modules/application-central/review.ts`, `review.test.ts`
- [ ] **Step 1:** Failing test `review.test.ts` (mirror `practice.test.ts`): `runReviewJob` with an injected reviewer → job `complete` + `result` set + (when reviewer returns `source:'ai'` with overall/verdict) the essay's `lastReview` persisted; reviewer throw → `failed`; enqueuer message shape `{type:'essay-coach', kind:'review', jobId, tenantId, studentId}` + fallback. Use `makeData(new InMemoryTableClient())`, create an essay first, create an `essayReviewJobs` job referencing it.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implement `review.ts` mirroring `practice.ts`, with these differences:
  - `import { makeBedrockEssayReviewer, type EssayReviewer } from './ai.js'` and `gatherCollegeContext`.
  - `runReviewJob(getData, reviewer, now, jobId)`:
```typescript
export async function runReviewJob(getData, reviewer: EssayReviewer, now: () => Date, jobId: string): Promise<void> {
  const data = getData();
  const job = await data.essayReviewJobs.get(jobId);
  if (!job) return;
  try {
    const essay = await data.essays.get(job.essayId);
    if (!essay) throw new Error('essay not found');
    const content = job.content ?? '';
    const college = await gatherCollegeContext(data, essay.collegeId);
    const review = await reviewer({ prompt: essay.prompt ?? '', content, targetWords: job.targetWords ?? essay.targetWords, college });
    await data.essayReviewJobs.update(jobId, { status: 'complete', result: review });
    if (review.source === 'ai' && review.overall !== undefined && review.verdict !== undefined) {
      await data.essays.update(job.essayId, { lastReview: { overall: review.overall, verdict: review.verdict, wordCount: review.wordCount, reviewedAt: now().toISOString() } });
    }
  } catch (err) {
    console.error('[essay-review] evaluation failed', jobId, err);
    await data.essayReviewJobs.update(jobId, { status: 'failed', error: err instanceof Error ? err.message : 'essay evaluation failed' });
  }
}
```
  - `ReviewDispatcher`, `makeInlineReviewDispatcher(getData, reviewer, now)`, `makeReviewWorkerHandler(getData, reviewer, now)` (keyed by `jobId`), and `makeSqsReviewEnqueuer(getData, reviewer, now, options)` — enqueuer prefers `ESSAY_COACH_QUEUE_URL ?? FOCUS_QUEUE_URL ?? HYDRATION_QUEUE_URL`, message `{ type: ESSAY_COACH_TYPE, kind: 'review', jobId, tenantId, studentId }` (import `ESSAY_COACH_TYPE` from `./practice.js`).
  - `export { makeBedrockEssayReviewer }`.
- [ ] **Step 4:** Run → pass; `tsc` clean. Commit: `feat(essay-center): async essay-evaluation job core + dispatchers`

### Task A4: Single manifest, sub-routed by `kind`
**Files:** `backend/modules/application-central/hydration.manifest.ts`, regenerated barrel
- [ ] **Step 1:** Rewrite the manifest so ONE registration handles both kinds:
```typescript
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { ESSAY_COACH_TYPE, makeBedrockPracticeQuestions, makeWorkerHandler } from './practice.js';
import { makeBedrockEssayReviewer, makeReviewWorkerHandler } from './review.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const questions = makeWorkerHandler(getData, makeBedrockPracticeQuestions());
const review = makeReviewWorkerHandler(getData, makeBedrockEssayReviewer(), () => new Date());

/** One registered type for the module's async work; sub-route by `kind`. */
const handler = async (payload: unknown): Promise<void> => {
  const kind = (payload as { kind?: string } | null)?.kind;
  if (kind === 'review') return review(payload);
  return questions(payload); // default / kind:'questions'
};
export const hydration = { type: ESSAY_COACH_TYPE, handler };
```
- [ ] **Step 2:** Regenerate the worker barrel: `cd backend && node scripts/build-lambda.mjs 2>&1 | tail -5`. Confirm no duplicate-type error and `generated/hydration-manifests.ts` still imports `applicationCentralHydration` (now typed `essay-coach`). `tsc` clean.
- [ ] **Step 3:** Commit (include the regenerated barrel): `feat(essay-center): one essay-coach manifest routing questions + review by kind`

### Task A5: Handlers — async `startReview` + `reviewStatus`, drop sync review
**Files:** `backend/modules/application-central/{handlers.ts,routes.manifest.ts,manifest.test.ts,handlers.test.ts}`
- [ ] **Step 1:** Rewrite the practice/review tests in `handlers.test.ts`: the `review` describe becomes async — `startReview` returns 202 + a job that (via the inline dispatcher) is already `complete` with `result`, and (when the injected reviewer returns `source:'ai'`) the essay's `lastReview` is persisted; `reviewStatus` returns the job; unknown jobId → 404. Keep the never-a-rewrite assertion (`result.rewrote === false`).
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implement:
  - `handlers.ts`: add `ReviewDispatcher`, `makeInlineReviewDispatcher`, `makeBedrockEssayReviewer` imports from `./review.js`; add `reviewJobIdParam` handling (reuse `jobIdParamSchema`). Add dep `reviewDispatch?: ReviewDispatcher`; default `deps.reviewDispatch ?? makeInlineReviewDispatcher(getData, deps.reviewer ?? makeBedrockEssayReviewer(), now)`. Replace the `review` handler:
```typescript
    // POST /essays/:id/review — ASYNC. Evaluation runs ~15-20s (near the 30s ceiling), so create a job,
    // dispatch to the essay-coach worker, return 202; the frontend polls reviewStatus.
    startReview: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const body = validateBody(reviewSchema, ctx);
      await requireEssay(id);
      const job = await getData().essayReviewJobs.create({
        essayId: id,
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.targetWords !== undefined ? { targetWords: body.targetWords } : {}),
        status: 'pending',
      } as Parameters<Data['essayReviewJobs']['create']>[0]);
      await reviewDispatch(job.jobId);
      const after = await getData().essayReviewJobs.get(job.jobId);
      return { status: 202, body: after ?? job };
    },
    // GET /essays/:id/review/:jobId — poll an evaluation job (by globally-unique jobId; :id is contextual).
    reviewStatus: async (ctx) => {
      const { jobId } = validateParams(jobIdParamSchema, ctx);
      const job = await getData().essayReviewJobs.get(jobId);
      if (!job) throw Errors.notFound('Evaluation job not found');
      return { status: 200, body: job };
    },
```
  Update the `AppCentralHandlers` interface: replace `review: Handler` with `startReview: Handler; reviewStatus: Handler;`. Remove the now-unused sync-review `now`/`latestDraft`/`reviewedDraft` logic if nothing else uses it (find-experiences/addDraft still use `now`/`latestDraft` — keep them).
  - `routes.manifest.ts` + `buildRoutes`: replace `POST /essays/:id/review → h.review` with `→ h.startReview`; add `GET /essays/:id/review/:jobId → h.reviewStatus`. Inject `reviewDispatch: makeSqsReviewEnqueuer(getData, makeBedrockEssayReviewer(), () => new Date())` into `makeHandlers`.
  - `manifest.test.ts`: add `'GET /essays/:id/review/:jobId'` to the hardcoded list (both sides sorted, so position-agnostic).
- [ ] **Step 4:** Route-matcher depth check — this is the first 4-segment route. Run `router.test.ts`; if the matcher is depth-capped, note it (unlikely; it splits by `/`). 
- [ ] **Step 5:** Green: `cd backend && npx tsc --noEmit && cd /mnt/c/Keira/keiras-journey && npx vitest run backend/modules/application-central/ --exclude '**/agents/**' && npm run check:routes`. Commit: `feat(essay-center): POST /essays/:id/review -> 202 async + GET review status`

### Task A6: Full backend green
- [ ] `cd backend && npx tsc --noEmit && npx vitest run` (root, agents excluded) → PASS. Commit if anything changed.

---

## Chunk B: Infra — dedicated essay-coach queue lane

### Task B1: essay-coach queue + worker in AsyncStack
**Files:** `infra/lib/async-stack.ts`
- [ ] **Step 1:** Mirror the focus lane (~225-282). Add public readonly fields `essayCoachQueue` + `essayCoachDeadLetterQueue` + `essayCoachWorkerFunctionName`. Queue `${config.namePrefix}-essay-coach` (visibilityTimeout 1800s, DLQ maxReceiveCount 3). Worker `${config.namePrefix}-essay-coach-worker`, shared bundle `backend/dist/hydration`, 300s, memory 512, `reservedConcurrentExecutions: 5`, env `{ TABLE_NAME, BEDROCK_MODEL_ID: config.bedrockSonnetProfile, SSM_PREFIX, STAGE }` — **NO `AI_WEB_SEARCH`** (review + questions are model-only). `SqsEventSource(batchSize:1, reportBatchItemFailures:true)`. Grants: `table.grantReadWriteData`, `bedrockInvokeStatement`, `ssmReadConfigStatement`. `putOutput` + `CfnOutput` for the queue url/arn/dlq.
- [ ] **Step 2:** `cd infra && npx tsc --noEmit` → PASS. If there's an infra snapshot test, update it. Commit: `feat(infra): dedicated essay-coach SQS lane (model-only interactive worker)`

### Task B2: Thread the queue into ApiStack
**Files:** `infra/bin/infra.ts`, `infra/lib/api-stack.ts`
- [ ] **Step 1:** `bin/infra.ts`: pass `essayCoachQueue: asyncStack.essayCoachQueue` into `ApiStack` props (next to `focusQueue`).
- [ ] **Step 2:** `api-stack.ts`: add `essayCoachQueue: IQueue` to the props interface; add env `ESSAY_COACH_QUEUE_URL: essayCoachQueue.queueUrl`; add `essayCoachQueue.grantSendMessages(routing)`.
- [ ] **Step 3:** `cd infra && npx tsc --noEmit` → PASS. `npx cdk synth --profile wnu ...` (or the repo's synth command) to confirm it builds. Commit: `feat(infra): grant API Lambda send on essay-coach queue + ESSAY_COACH_QUEUE_URL`

*(The enqueuers were already pointed at `ESSAY_COACH_QUEUE_URL ?? FOCUS_QUEUE_URL ?? HYDRATION_QUEUE_URL` in A1/A3, so no code change here.)*

---

## Chunk C: Frontend — no-tabs Essay Center shell + college list

### Task C1: Nav rename
**Files:** `frontend/src/modules/application-central/nav.manifest.ts`
- [ ] `label: 'Essay Center'`, `route: '/essays'`. Grep `frontend/src` for `'/applications'` — only this file references it; no other links to fix. Commit: `feat(essay-center): rename nav to Essay Center at /essays`

### Task C2: `CollegeEssayList` (new)
**Files:** Create `frontend/src/modules/application-central/CollegeEssayList.tsx`, `.test.tsx`
- [ ] **Contract:** `{ onStart: (c: {collegeId: string; name: string}) => void; onOpen: (c) => void }`. Loads `listCollegeOptions()` (spine) + `listEssays()`; per college compute count via `groupEssaysByCollege`. Each row: name + "N practice essays" (0 → subtle "no practice yet") + a button — **Start essay** when count 0, **Essays →** when count > 0. Legacy essays with no `collegeId` are ignored (not rendered as phantom colleges). Field-Notes styling; no deadline/exam columns.
- [ ] **Test (jsdom):** mock api; a college with 0 essays shows "Start essay" → `onStart`; a college with 2 shows "2 practice essays" + "Essays →" → `onOpen`. Commit.

### Task C3: `CollegeEssayView` (new; replaces EssayCoachStart's picker role)
**Files:** Create `frontend/src/modules/application-central/CollegeEssayView.tsx`, `.test.tsx`; delete `EssayCoachStart.tsx`/`.test.tsx`
- [ ] **Contract:** `{ college: {collegeId: string; name: string}; startMode: 'new' | 'attempts'; onBack: () => void }`. Sub-states: `attempts` (list this college's essays via `listEssays({collegeId})`, each opens `EssayWorkspace`; + a "Search for a new question" button) → `searching` (start `startPracticeQuestions({collegeId})` + poll, clear copy "Looking for practice questions for {name}…") → `questions` (cards + "Write about this one" → `createEssay({collegeId, prompt, promptSource})` → opens `EssayWorkspace`). `startMode:'new'` skips straight to `searching`; `'attempts'` starts on the attempts list. Reuse the existing poll loop (reqRef guard, MAX_POLLS 40) and the disclosure-banner/zero-questions render from the old EssayCoachStart — minus the picker/typed-school/general-practice. "← back to colleges" calls `onBack`.
- [ ] **Test (jsdom):** `startMode:'new'` → searching copy → (poll complete) questions render → "Write about this one" calls `createEssay` with the fixed `collegeId` → opens workspace. `startMode:'attempts'` → lists existing essays + "Search for a new question". Commit.

### Task C4: `EssayCenterPage` (rename ApplicationCentralPage) — remove tabs + dead views
**Files:** rename `ApplicationCentralPage.tsx` → `EssayCenterPage.tsx` (+ its test); update `nav.manifest.ts` element import; delete `RecommendationBoard.tsx`, `TestScoreTracker.tsx`, `DecisionMatrix.tsx`, `ApplicationOverview.tsx` (+ their tests)
- [ ] **Step 1:** New `EssayCenterPage`: state `{ college?: {collegeId,name}; mode: 'new'|'attempts' }`. Header "Essay Center". No `Tabs`. When no college selected → `<CollegeEssayList onStart={c=>{setCollege(c);setMode('new')}} onOpen={c=>{setCollege(c);setMode('attempts')}} />`. When selected → `<CollegeEssayView college={college} startMode={mode} onBack={()=>setCollege(undefined)} />`. Remove all imports of the deleted components, `Tabs`, the modal, picker state.
- [ ] **Step 2:** Delete the three tab components + `ApplicationOverview` + their `.test.tsx`. Grep to confirm no other importers (spec review confirmed only the page imports them). Leave `api.ts` recommender/test-score/decision/overview client fns (unused, harmless — no dead-export lint).
- [ ] **Step 3:** Update `nav.manifest.ts` `element: () => import('./EssayCenterPage')`.
- [ ] **Step 4:** `EssayCenterPage.test.tsx`: renders the college list (no tabs), header "Essay Center". Green + `tsc` + `lint`. Commit: `feat(essay-center): no-tabs shell (college list <-> per-college essay view); drop dead tabs`

---

## Chunk D: Frontend — async evaluation UI

### Task D1: api — start+poll evaluation
**Files:** `frontend/src/modules/application-central/{types.ts,api.ts}`
- [ ] Add FE `EssayReviewJob { jobId; essayId; status:'pending'|'complete'|'failed'; result?: EssayReview; error? }` to `types.ts`. In `api.ts`: replace `reviewEssay` with `startEssayEvaluation(essayId, { content, targetWords })` → `POST /essays/${id}/review` (returns job) and `getEssayEvaluationJob(essayId, jobId)` → `GET /essays/${id}/review/${jobId}`. Commit with D2 (removing `reviewEssay` breaks EssayWorkspace until D2).

### Task D2: `EssayWorkspace` — Evaluate button → evaluating view → result → back to edit
**Files:** `frontend/src/modules/application-central/{EssayWorkspace.tsx,EssayWorkspace.test.tsx}`
- [ ] **Step 1:** Update tests: mock `startEssayEvaluation`/`getEssayEvaluationJob`; clicking **Evaluate** shows the evaluating view ("Evaluating your essay — this can take up to a minute"), then (job complete) the result view (rubric bars + score + verdict + strengths/improve + "never a rewrite"), then **Back to editing** returns to the editor with the draft intact. Poll-path test uses fake timers (POLL_MS). Keep the "Try a different question" autosave-gate test.
- [ ] **Step 2:** Implement: rename the sidebar review button to **"Evaluate"**; introduce a view mode within the workspace: `editing | evaluating | result`. On Evaluate → `evaluating`, run `startEssayEvaluation` + poll (POLL_MS 3000, MAX_POLLS 30, reqRef guard) → on complete set the review + `result`; failed/timeout → error + back to editing. The evaluating view is a clear full panel (spinner + "up to a minute"). The result view renders the existing rubric block + **Back to editing** (→ `editing`, draft preserved). Re-evaluate loops. Keep Find experiences / Save draft / Copy essay / Mark final / Try a different question. Delete the old inline `reviewEssay` call + `review`/`reviewing` inline sidebar render (moved into result view).
- [ ] **Step 3:** Green: `cd frontend && npx tsc --noEmit && cd /mnt/c/Keira/keiras-journey && npx vitest run frontend/src/modules/application-central/ --exclude '**/agents/**' && npm run lint`. Commit: `feat(essay-center): Evaluate -> async 'up to a minute' view -> result -> back to editing`

---

## Chunk E: Full green + deploy + staging E2E

- [ ] **E1:** Whole repo: `cd backend && npx tsc --noEmit && npx vitest run` (root, agents excluded); `cd frontend && npx tsc --noEmit`; `cd infra && npx tsc --noEmit`; root `npm run lint && npm run check:routes` → all PASS.
- [ ] **E2:** Controller: PR into `dev` → CI + CodeRabbit → merge (standing auth) → staging deploy. **Deploy note:** infra change (new queue/worker) — confirm `Deploy Staging` provisions `${prefix}-essay-coach` queue + `-essay-coach-worker`, and that the API Lambda env has `ESSAY_COACH_QUEUE_URL`. Confirm account `010928187255` first.
- [ ] **E3:** Staging E2E (login grahem): Essay Center at /essays → **college list** (no tabs) → **Start essay** on a roster college → clear **"searching for practice questions"** state → questions → **Write about this one** → write → **Evaluate** → clear **"evaluating, up to a minute"** view → rubric result → **Back to editing** → re-evaluate → **← back to colleges**. Then **Essays →** on that college → attempts list + "new question". Verify jobs run on the essay-coach worker (CloudWatch) and neither questions nor evaluation 503 or hang. Screenshot each state.

---

## Notes / risks
- **Deploy ordering:** this ships FE + BE + infra together in one PR/deploy — no frontend-ahead-of-worker window (the earlier stuck-spinner cause). Verify the worker + queue exist before exercising.
- **`essay-coach` type migration:** questions messages change from `type:'practice-questions'` to `type:'essay-coach'/kind:'questions'`. No meaningful in-flight messages on staging; deploy atomically.
- **Reserved concurrency budget:** 10 (hydration) + 3 (focus) + 5 (essay-coach) = 18, far under 1000.
- **Out of scope:** folder/prefix rename; deleting backend recommender/test-score/decision endpoints; prod.
