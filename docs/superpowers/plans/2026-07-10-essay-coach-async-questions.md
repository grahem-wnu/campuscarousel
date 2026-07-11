# Essay Coach — Async Practice Questions (30s-ceiling fix) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move practice-question generation off the request path. Staging proved the model-only Sonnet call takes ~25–30s and 503s at API Gateway's hard 30s limit on the roster-college path. Convert `POST /essays/practice-questions` into an async job + poll, mirroring the existing **cert-guidance** pattern.

**Architecture:** Transient job record (`PracticeQuestionJob`, keyed by `jobId`) in the single table. `POST` creates the job `pending`, enqueues onto the **existing focus queue** (interactive lane; `FOCUS_QUEUE_URL`), returns **202** + the job. The shared 300s hydration worker (registered via `hydration.manifest.ts`) runs the same model-only generator with a full budget and writes `result`/`status` back. Frontend polls `GET /essays/practice-questions/:jobId` until it settles. **No infra/CDK change** — the API Lambda already has `FOCUS_QUEUE_URL` + send grant, and the focus worker already has Bedrock/SSM. Still model-only (no web search added).

**Tech Stack:** TS end to end; Zod; DynamoDB single-table (`makeDetailsRepo`); SQS worker via manifest glob; Vitest + RTL (jsdom). Template to copy verbatim in style: `backend/modules/certifications/{guidance.ts,enqueue.ts,hydration.manifest.ts,handlers.ts}` + `frontend/src/modules/certifications/CertGuidanceSection.tsx`.

**Conventions:** AWS `--profile wnu`, `us-east-2`. Tests from repo ROOT (`cd /mnt/c/Keira/keiras-journey && npx vitest run <path>`); typecheck from workspace dir. `npm run check:routes` from ROOT. Commit each green step. Branch `feat/essay-coach-practice` (already has the sync version; this supersedes it). Do NOT run `npm install`; revert any lockfile churn.

---

## Chunk A: Backend — job record, worker, enqueue, handlers/routes

### Task A1: `PracticeQuestionJob` data type + result type + repo

**Files:** `backend/shared/data/types.ts`, `backend/shared/data/index.ts`

- [ ] **Step 1: Add the result + job types** in `types.ts` (near the other `*Job` types, e.g. after `CertGuidanceJob`):

```typescript
/** The augmented practice-question payload the worker computes and the UI renders. */
export interface PracticeQuestionResult {
  questions: { question: string; why: string; tip: string }[];
  source: 'ai' | 'curated';
  collegeName?: string;
  usedRealPrompts: boolean;
}

/** Async practice-question generation job. Model-only Bedrock, but slow enough to blow the request
 *  path's ~30s ceiling, so it runs on the worker and the frontend polls. PK=PRACTICEQUESTIONS#<jobId>. */
export interface PracticeQuestionJob extends Timestamped {
  jobId: string;
  collegeId?: string;
  collegeName?: string;
  count?: number;
  status: 'pending' | 'complete' | 'failed';
  result?: PracticeQuestionResult;
  error?: string;
}
```

- [ ] **Step 2: Register the repo** in `index.ts` (mirror `certGuidanceJobs` at ~line 205, and add to the returned object next to it):

```typescript
  const practiceQuestionJobs = makeDetailsRepo<PracticeQuestionJob, 'jobId'>(client, {
    prefix: 'PRACTICEQUESTIONS',
    idField: 'jobId',
  });
```
Add `practiceQuestionJobs,` to the return object, and `PracticeQuestionJob`/`PracticeQuestionResult` to the type imports at the top of `index.ts` (it re-exports the data types — follow how `CertGuidanceJob` is imported/exported there).

- [ ] **Step 3: Typecheck + commit**

Run: `cd backend && npx tsc --noEmit` → PASS.
```bash
git add backend/shared/data/types.ts backend/shared/data/index.ts
git commit -m "feat(essay-coach): PracticeQuestionJob record type + repo"
```

### Task A2: Job core + worker handler + dispatchers (`practice.ts`)

**Files:** Create `backend/modules/application-central/practice.ts`; Test `backend/modules/application-central/practice.test.ts`

Mirrors `certifications/guidance.ts`. The core `runPracticeJob` moves the college-context + generator logic out of the handler so both the inline fallback and the worker share it.

- [ ] **Step 1: Write the failing test** (`practice.test.ts`):

```typescript
import { describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { runPracticeJob } from './practice.js';
import type { PracticeQuestionGenerator } from './ai.js';

const gen: PracticeQuestionGenerator = async ({ college }) => ({
  questions: [{ question: `q for ${college?.name ?? 'general'}`, why: 'w', tip: 't' }],
  source: 'ai' as const,
});

async function mk(): Promise<Data> { return makeData(new InMemoryTableClient()); }

describe('runPracticeJob', () => {
  it('marks complete with usedRealPrompts true for a roster college with prompts', async () => {
    const data = await mk();
    const college = await data.colleges.create({ name: 'Ohio State', status: 'applying', essayPrompts: ['Why OSU?'] } as Parameters<Data['colleges']['create']>[0]);
    const job = await data.practiceQuestionJobs.create({ collegeId: college.collegeId, status: 'pending' });
    await runPracticeJob(() => data, gen, async () => [], job.jobId);
    const after = await data.practiceQuestionJobs.get(job.jobId);
    expect(after?.status).toBe('complete');
    expect(after?.result?.usedRealPrompts).toBe(true);
    expect(after?.result?.collegeName).toBe('Ohio State');
    expect(after?.result?.questions).toHaveLength(1);
  });

  it('typed name → usedRealPrompts false; generator throw → failed', async () => {
    const data = await mk();
    const job = await data.practiceQuestionJobs.create({ collegeName: 'Imaginary U', status: 'pending' });
    await runPracticeJob(() => data, gen, async () => [], job.jobId);
    expect((await data.practiceQuestionJobs.get(job.jobId))?.result?.usedRealPrompts).toBe(false);

    const boom: PracticeQuestionGenerator = async () => { throw new Error('bedrock down'); };
    const job2 = await data.practiceQuestionJobs.create({ status: 'pending' });
    await runPracticeJob(() => data, boom, async () => [], job2.jobId);
    const after2 = await data.practiceQuestionJobs.get(job2.jobId);
    expect(after2?.status).toBe('failed');
    expect(after2?.error).toContain('bedrock down');
  });
});
```

- [ ] **Step 2: Run → fail** (`./practice.js` missing).

Run: `cd /mnt/c/Keira/keiras-journey && npx vitest run backend/modules/application-central/practice.test.ts` → FAIL.

- [ ] **Step 3: Implement `practice.ts`** (mirror `guidance.ts`):

```typescript
// Async practice-question generation. Model-only Bedrock, but generating ~5 detailed questions runs
// ~25–30s and 503s at API Gateway's hard ~30s ceiling — so the handler enqueues a job and this runs on
// the shared 300s worker, writing the result back for the frontend to poll. (Same shape as
// certifications/guidance.ts; unlike it, this is NOT web-grounded — just slow output.)

import type { Data } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { gatherCollegeContext, type CollegeContext } from './grounding.js';
import { makeBedrockPracticeQuestions, type PracticeQuestionGenerator } from './ai.js';

export const PRACTICE_QUESTIONS_TYPE = 'practice-questions';

export interface PracticeQuestionMessage {
  type: typeof PRACTICE_QUESTIONS_TYPE;
  jobId: string;
}

/** One seam for "run this practice job". Production = SQS enqueue; tests/no-queue = inline. */
export type PracticeDispatcher = (jobId: string) => Promise<void>;
/** Resolve the active student's intended majors (for major-aware prompts). Injectable for tests. */
export type MajorsResolver = (data: Data) => Promise<string[]>;

/** Default majors resolver — reads the per-student profile, [] on any miss. */
export const majorsFromProfile: MajorsResolver = async (data) => {
  try {
    return (await data.studentProfile.get())?.intendedMajors ?? [];
  } catch {
    return [];
  }
};

/** Run one practice job: read it, resolve college context, generate, write result. No-op if the job is
 *  gone; a genuine failure marks it `failed` (surfaced via polling) rather than throwing. */
export async function runPracticeJob(
  getData: () => Data,
  generator: PracticeQuestionGenerator,
  majors: MajorsResolver,
  jobId: string,
): Promise<void> {
  const data = getData();
  const job = await data.practiceQuestionJobs.get(jobId);
  if (!job) return;
  try {
    const college: CollegeContext | undefined = job.collegeId
      ? await gatherCollegeContext(data, job.collegeId)
      : job.collegeName
        ? { collegeId: '', name: job.collegeName }
        : undefined;
    const set = await generator({ college, majors: await majors(data), count: job.count });
    await data.practiceQuestionJobs.update(jobId, {
      status: 'complete',
      result: { ...set, collegeName: college?.name, usedRealPrompts: (college?.essayPrompts?.length ?? 0) > 0 },
    });
  } catch (err) {
    console.error('[practice-questions] generation failed', jobId, err);
    await data.practiceQuestionJobs.update(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'practice question generation failed',
    });
  }
}

/** Inline dispatcher — generate now, within the call. Tests + no-queue fallback. */
export function makeInlineDispatcher(
  getData: () => Data,
  generator: PracticeQuestionGenerator,
  majors: MajorsResolver = majorsFromProfile,
): PracticeDispatcher {
  return (jobId) => runPracticeJob(getData, generator, majors, jobId);
}

/** SQS worker-side handler for the shared hydration registry (payload → Promise<void>). */
export function makeWorkerHandler(
  getData: () => Data,
  generator: PracticeQuestionGenerator,
  majors: MajorsResolver = majorsFromProfile,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<PracticeQuestionMessage>;
    if (typeof msg.jobId !== 'string' || !msg.jobId) return;
    await runPracticeJob(getData, generator, majors, msg.jobId);
  };
}

/** Minimal structural type of the SQS client (just `send`). */
export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface SqsPracticeEnqueuerOptions {
  /** Defaults to FOCUS_QUEUE_URL (interactive lane) then HYDRATION_QUEUE_URL. */
  queueUrl?: string;
  client?: SqsSender;
  fallback?: PracticeDispatcher;
}

/** Production dispatcher: enqueue a `practice-questions` job onto the interactive (focus) queue. On any
 *  enqueue failure, degrade to inline generation (logged, not swallowed). */
export function makeSqsPracticeEnqueuer(
  getData: () => Data,
  generator: PracticeQuestionGenerator,
  options: SqsPracticeEnqueuerOptions = {},
): PracticeDispatcher {
  const fallback = options.fallback ?? makeInlineDispatcher(getData, generator);
  return async (jobId) => {
    const queueUrl = options.queueUrl ?? process.env.FOCUS_QUEUE_URL ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback(jobId);
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: PRACTICE_QUESTIONS_TYPE,
            jobId,
            tenantId: currentTenantId(),
            studentId: currentStudentId(),
          }),
        }),
      );
    } catch (err) {
      console.error('[practice-questions] enqueue failed, falling back to inline generation', { jobId, err });
      await fallback(jobId);
    }
  };
}

/** Re-export the default generator for the manifest + routes wiring. */
export { makeBedrockPracticeQuestions };
```

- [ ] **Step 4: Run → pass; commit.**

Run: `cd /mnt/c/Keira/keiras-journey && npx vitest run backend/modules/application-central/practice.test.ts` → PASS. `cd backend && npx tsc --noEmit` → PASS.
```bash
git add backend/modules/application-central/practice.ts backend/modules/application-central/practice.test.ts
git commit -m "feat(essay-coach): async practice-question job core + dispatchers"
```

### Task A3: Worker manifest

**Files:** Create `backend/modules/application-central/hydration.manifest.ts`

- [ ] **Step 1: Implement** (mirror `certifications/hydration.manifest.ts`; model-only, so default generator, no `webSearch`):

```typescript
// Worker-side registration for async practice-question generation. build-lambda.mjs globs each module's
// hydration.manifest.ts and statically imports its `hydration` export into the worker's type→handler
// registry. A `practice-questions` message runs this handler on the shared 300s worker (full budget for
// the slow, model-only generation the API can't run inline).

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { PRACTICE_QUESTIONS_TYPE, makeBedrockPracticeQuestions, makeWorkerHandler } from './practice.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
const handler = makeWorkerHandler(getData, makeBedrockPracticeQuestions());

export const hydration = { type: PRACTICE_QUESTIONS_TYPE, handler };
```

- [ ] **Step 2: Verify the worker barrel builds** (the glob picks it up):

Run: `cd backend && node scripts/build-lambda.mjs 2>&1 | tail -5` (or the repo's lambda-build script). Confirm no duplicate-type error and that `generated/hydration-manifests.ts` now imports the new manifest. Then `npx tsc --noEmit` → PASS.

- [ ] **Step 3: Commit.**
```bash
git add backend/modules/application-central/hydration.manifest.ts backend/lambda/generated/hydration-manifests.ts
git commit -m "feat(essay-coach): register practice-questions worker (reuses shared worker bundle)"
```
> If `hydration-manifests.ts` is git-ignored/build-only, omit it from the add; note that in the commit body.

### Task A4: Handlers + routes (POST→202, new GET status)

**Files:** `backend/modules/application-central/{handlers.ts,schema.ts,routes.manifest.ts,manifest.test.ts,handlers.test.ts}`

- [ ] **Step 1: Update failing tests first** in `handlers.test.ts`. The practice handler is now async. With the default inline dispatcher (no queue in tests), `practiceDispatch` runs `runPracticeJob` synchronously, so the re-read returns a **complete** job. Rewrite the practice describe block:

```typescript
describe('practice-questions (async job)', () => {
  it('creates a job, runs it inline (no queue), returns 202 with the complete result', async () => {
    const localH = makeHandlers({
      getData: () => data, now,
      practice: async ({ college }) => ({ questions: [{ question: 'q', why: 'w', tip: 't' }], source: 'curated' as const }),
    });
    const college = await data.colleges.create({ name: 'Ohio State', status: 'applying', essayPrompts: ['Why OSU?'] } as Parameters<Data['colleges']['create']>[0]);
    const res = await localH.practiceQuestionsForCollege(ctx({ body: { collegeId: college.collegeId } }));
    expect(res.status).toBe(202);
    const job = res.body as { jobId: string; status: string; result?: { usedRealPrompts: boolean; collegeName?: string } };
    expect(job.status).toBe('complete');
    expect(job.result?.usedRealPrompts).toBe(true);
    expect(job.result?.collegeName).toBe('Ohio State');

    // status endpoint returns the same job
    const poll = await localH.practiceQuestionsStatus(ctx({ params: { jobId: job.jobId } }));
    expect((poll.body as { jobId: string }).jobId).toBe(job.jobId);
  });

  it('typed name → usedRealPrompts false; unknown jobId → 404; strict-schema 422', async () => {
    const localH = makeHandlers({ getData: () => data, now, practice: async () => ({ questions: [{ question: 'q', why: 'w', tip: 't' }], source: 'ai' as const }) });
    const typed = await localH.practiceQuestionsForCollege(ctx({ body: { collegeName: 'Imaginary U' } }));
    expect((typed.body as { result?: { usedRealPrompts: boolean } }).result?.usedRealPrompts).toBe(false);
    await expectStatus(localH.practiceQuestionsStatus(ctx({ params: { jobId: 'ghost' } })), 404);
    await expectStatus(localH.practiceQuestionsForCollege(ctx({ body: { bogus: 1 } })), 422);
  });
});
```
Also migrate the older "passes the linked college…" test if it still calls `practiceQuestionsForCollege` and inspects `body` directly — it now returns a 202 job whose `.result` holds the set.

- [ ] **Step 2: Run → fail** (`practiceQuestionsStatus`/202 shape missing).

- [ ] **Step 3: Implement.**

`schema.ts` — add:
```typescript
export const jobIdParamSchema = z.object({ jobId: z.string().min(1) });
```

`handlers.ts`:
- Imports: add `type PracticeDispatcher, makeInlineDispatcher, makeBedrockPracticeQuestions` from `./practice.js`; add `jobIdParamSchema` from `./schema.js`; keep `collegePracticeSchema`. Remove the now-unused inline `gatherCollegeContext` usage in the practice path if it's no longer referenced elsewhere (it is still used by `findExperiences`/`review`, so keep the import).
- `AppCentralHandlers`: replace nothing removed; add `practiceQuestionsStatus: Handler;` (keep `practiceQuestionsForCollege`).
- `AppCentralDeps`: add `practiceDispatch?: PracticeDispatcher;` (keep `practice?`).
- In `makeHandlers`: `const practice = deps.practice ?? makeBedrockPracticeQuestions();` and `const practiceDispatch = deps.practiceDispatch ?? makeInlineDispatcher(getData, practice);`
- Replace the `practiceQuestionsForCollege` body:
```typescript
    // POST /essays/practice-questions — ASYNC. Model-only generation runs ~25–30s and 503s at the
    // request path's ~30s ceiling, so create a job, enqueue it (focus queue), return 202; the worker
    // fills the result and the frontend polls practiceQuestionsStatus.
    practiceQuestionsForCollege: async (ctx) => {
      const body = validateBody(collegePracticeSchema, ctx);
      const data = getData();
      const job = await data.practiceQuestionJobs.create({
        ...(body.collegeId ? { collegeId: body.collegeId } : {}),
        ...(body.collegeName ? { collegeName: body.collegeName } : {}),
        ...(body.count ? { count: body.count } : {}),
        status: 'pending',
      } as Parameters<Data['practiceQuestionJobs']['create']>[0]);
      await practiceDispatch(job.jobId);
      const after = await data.practiceQuestionJobs.get(job.jobId);
      return { status: 202, body: after ?? job };
    },

    // GET /essays/practice-questions/:jobId — poll a practice job's status + result.
    practiceQuestionsStatus: async (ctx) => {
      const { jobId } = validateParams(jobIdParamSchema, ctx);
      const job = await getData().practiceQuestionJobs.get(jobId);
      if (!job) throw Errors.notFound('Practice question job not found');
      return { status: 200, body: job };
    },
```

`routes.manifest.ts`: inject the enqueuer + register the GET. The POST path string is unchanged:
```typescript
import { makeSqsPracticeEnqueuer, makeBedrockPracticeQuestions } from './practice.js';
// ...
const h = makeHandlers({
  getData,
  practiceDispatch: makeSqsPracticeEnqueuer(getData, makeBedrockPracticeQuestions()),
});
// ...in the routes array, next to the POST:
  { method: 'POST', path: '/essays/practice-questions', handler: h.practiceQuestionsForCollege },
  { method: 'GET', path: '/essays/practice-questions/:jobId', handler: h.practiceQuestionsStatus },
```
Mirror the GET in `buildRoutes` (handlers.ts). Add `practiceQuestionsStatus` to any place `buildRoutes` lists handlers.

`manifest.test.ts`: add `'GET /essays/practice-questions/:jobId'` to the hardcoded endpoint list, in sorted position (it sorts after `'GET /essays/:id'` and `'GET /essays'`; `'practice-questions'` `'p'` > `':'`, and the 3-segment GET sorts among the 3-seg GETs — run the test to see the exact sorted output and match).

- [ ] **Step 4: Route-shadow sanity.** `GET /essays/practice-questions/:jobId` (3 seg, static 2nd segment) vs `GET /essays/:id` (2 seg) — different segment counts, no conflict. Confirm via the router test.

- [ ] **Step 5: Green + commit.**

Run: `cd backend && npx tsc --noEmit && cd /mnt/c/Keira/keiras-journey && npx vitest run backend/modules/application-central/ && npm run check:routes` → all PASS.
```bash
git add backend/modules/application-central/{handlers.ts,schema.ts,routes.manifest.ts,manifest.test.ts,handlers.test.ts}
git commit -m "feat(essay-coach): POST practice-questions → 202 async job + GET status endpoint"
```

### Task A5: Full backend green
- [ ] Run: `cd backend && npx tsc --noEmit && npx vitest run` → PASS. Commit only if anything changed.

---

## Chunk B: Frontend — start-job + poll

### Task B1: Types + API client

**Files:** `frontend/src/modules/application-central/{types.ts,api.ts}`

- [ ] **Step 1: Add the job type** in `types.ts` (keep `PracticeQuestionSet` — it's the `result` shape):
```typescript
export interface PracticeQuestionJob {
  jobId: string;
  status: 'pending' | 'complete' | 'failed';
  collegeId?: string;
  collegeName?: string;
  count?: number;
  result?: PracticeQuestionSet;
  error?: string;
}
```

- [ ] **Step 2: Replace the API fn** in `api.ts` — swap `getPracticeQuestionsForCollege` for start + poll (mirror `certifications/api.ts`):
```typescript
/** Start an async practice-question job. Poll getPracticeQuestionJob until it settles. */
export function startPracticeQuestions(
  input: { collegeId?: string; collegeName?: string; count?: number } = {},
): Promise<PracticeQuestionJob> {
  return api.post<PracticeQuestionJob>('/essays/practice-questions', input);
}
export function getPracticeQuestionJob(jobId: string): Promise<PracticeQuestionJob> {
  return api.get<PracticeQuestionJob>(`/essays/practice-questions/${encodeURIComponent(jobId)}`);
}
```

- [ ] **Step 3: Typecheck** — will FAIL until B2 updates `EssayCoachStart`. Commit B1+B2 together, OR keep `getPracticeQuestionsForCollege` alongside until B2 then remove. Prefer: implement B2 in the same working session and commit together.

### Task B2: `EssayCoachStart` — start + poll

**Files:** `frontend/src/modules/application-central/{EssayCoachStart.tsx,EssayCoachStart.test.tsx}`

- [ ] **Step 1: Update the tests** to mock the async pair. A `complete` job returned from `startPracticeQuestions` exits the poll loop immediately (no fake timers needed):
```typescript
const { startPracticeQuestions, getPracticeQuestionJob, createEssay } = vi.hoisted(() => ({
  startPracticeQuestions: vi.fn(),
  getPracticeQuestionJob: vi.fn(),
  createEssay: vi.fn(),
}));
vi.mock('./api', () => ({ startPracticeQuestions, getPracticeQuestionJob, createEssay }));
// ...
// Roster test: startPracticeQuestions resolves a COMPLETE job so no polling is needed.
startPracticeQuestions.mockResolvedValue({
  jobId: 'j1', status: 'complete',
  result: { questions: [{ question: 'Why nursing at OSU?', why: 'w', tip: 't' }], source: 'curated', collegeName: 'Ohio State', usedRealPrompts: true },
});
```
Update all existing EssayCoachStart tests (roster real-prompts, typed disclosure, createEssay-rejection, zero-questions) to this shape — `result` carries the same `PracticeQuestionSet` the render already reads, so only the fetch mock changes. Add one test where `startPracticeQuestions` returns `{jobId, status:'pending'}` and the first `getPracticeQuestionJob` returns a `complete` job → assert questions render (proves the poll path). Zero-questions: `result.questions: []`.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** — replace the direct-await in `loadQuestions` with start+poll, keeping the `reqRef` stale-guard around the WHOLE sequence and the disable-while-loading. Add poll constants:
```typescript
const POLL_MS = 3000;
const MAX_POLLS = 40; // ~2 min; generation runs on the 300s worker but is usually ~25-40s
```
```typescript
  async function loadQuestions(o: Origin) {
    const myReq = ++reqRef.current;
    setOrigin(o);
    setLoading(true);
    setError(null);
    try {
      let job = await startPracticeQuestions(o);
      for (let i = 0; job.status === 'pending' && i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (myReq !== reqRef.current) return; // superseded by a newer pick
        job = await getPracticeQuestionJob(job.jobId);
      }
      if (myReq !== reqRef.current) return;
      if (job.status === 'failed') { setError('Could not pull questions right now — please try again in a moment.'); return; }
      if (job.status === 'pending') { setError('This is taking longer than expected — please try again in a moment.'); return; }
      setSet(job.result ?? { questions: [], source: 'ai', usedRealPrompts: false });
    } catch (err) {
      if (myReq === reqRef.current) setError(err instanceof Error ? err.message : 'Could not load practice questions.');
    } finally {
      if (myReq === reqRef.current) setLoading(false);
    }
  }
```
Keep everything else (auto-load effect, write(), render, disclosure banner, zero-questions empty state, disable-while-loading). Update the pending-state copy if desired ("Looking up {school}'s questions — this can take up to a minute."). Ensure `getPracticeQuestions`/`getPracticeQuestionsForCollege` are gone from `api.ts` and this file.

- [ ] **Step 4: Green + commit.**

Run: `cd /mnt/c/Keira/keiras-journey && npx vitest run frontend/src/modules/application-central/EssayCoachStart.test.tsx && cd frontend && npx tsc --noEmit && cd /mnt/c/Keira/keiras-journey && npm run lint` → PASS.
```bash
git add frontend/src/modules/application-central/{types.ts,api.ts,EssayCoachStart.tsx,EssayCoachStart.test.tsx}
git commit -m "feat(essay-coach): frontend starts an async practice-questions job and polls"
```

### Task B3: Full green + deploy + staging re-verify
- [ ] **Step 1:** Whole-repo: `cd backend && npx tsc --noEmit && npx vitest run`; `cd frontend && npx tsc --noEmit`; `cd /mnt/c/Keira/keiras-journey && npx vitest run frontend/src/modules/application-central && npm run lint && npm run check:routes` → all PASS.
- [ ] **Step 2:** This is controller-driven: PR into `dev` (CI + CodeRabbit), merge (standing auth) → staging auto-deploys. **Deploy note:** the new worker route is registered on the SHARED hydration worker bundle — confirm the `AsyncStack`/worker deploys (the manifest barrel is regenerated by the lambda build). No new queue.
- [ ] **Step 3: Staging E2E (the whole point):** log in, Application Central → Essays → Practice a new essay → pick a **roster** school (the path that 503'd) → confirm it now returns 202 fast, shows a "looking up…" state, then renders questions within ~40s (no 503). Repeat for a typed school (disclosure banner) and general practice. Then "Write about this one" → coach loop → "Try a different question" preserves the draft.

---

## Notes / risks
- **No infra change** by design (reuse focus queue). If for some reason `FOCUS_QUEUE_URL` isn't set on the API Lambda, the enqueuer falls back to `HYDRATION_QUEUE_URL`, then inline (which would re-introduce the 30s risk in prod) — so **verify `FOCUS_QUEUE_URL` is present** in the deployed API Lambda env during Step B3.
- Worker `batchSize:1` + marks `failed` on model error (surfaced by polling, not DLQ'd) — matches the established pattern.
- Privacy unchanged: model-only, no experience pool, tenant/student scoping enforced by the worker entry (message carries `tenantId`/`studentId`).
