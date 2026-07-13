# College Buckets (Reach / Target / Safety) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every college an admissions-likelihood bucket (reach / target / safety) — AI-suggested per college, family-overridable — and group the college list into those buckets.

**Architecture:** A new `bucket-ai.ts` in `college-hub` mirrors the existing `prep-ai.ts` seam (model-only Bedrock call, pure prompt/parse, undefined-on-error, async SQS job routed by a `task` field). Suggestions are computed during hydration and back-filled via a fire-and-forget job the list handler enqueues. A family override (`College.bucket`) is a user field set by a new `PATCH /colleges/:id/bucket`; the AI's `suggestedBucket*` are system fields written only via `mergePreservingUserEdits` so they never stomp the override and vice-versa.

**Tech Stack:** Node 20 / TypeScript, Vitest, DynamoDB single-table (schemaless — no migration), SQS worker (shared `college-hydrate` type), React + Vite + Tailwind (Field Notes design system), Amplify.

**Reference the spec:** `docs/superpowers/specs/2026-07-12-college-buckets-design.md`.

**Run all tests from the repo ROOT** with `--exclude '**/agents/**'` (the `agents/*` worktrees pollute runs; running vitest from `backend/` loads a bad setup path). Typecheck FE from `frontend/`.

---

## Chunk 1: Data model + shared bucket type

### Task 1: Add the bucket type + College fields

**Files:**
- Modify: `backend/shared/data/types.ts` (the `College` interface ~line 152; add the shared literal near it)

- [ ] **Step 1: Add the shared literal + type.** Near the `College` interface in `types.ts`, add:

```ts
/** Admissions-likelihood bucket — SEPARATE from `College.status` (application lifecycle). */
export const ADMISSION_BUCKETS = ['reach', 'target', 'safety'] as const;
export type AdmissionBucket = (typeof ADMISSION_BUCKETS)[number];
```

- [ ] **Step 2: Add fields to the `College` interface** (alongside `hsPrepStatus` etc.):

```ts
  /** AI-suggested admissions bucket (system field — written via mergePreservingUserEdits, never
   *  marked userEdited). Refreshed on each hydration; absent until the first suggestion runs. */
  suggestedBucket?: AdmissionBucket;
  suggestedBucketRationale?: string;
  suggestedBucketConfidence?: 'low' | 'medium' | 'high';
  /** Family override. When set, it is the effective bucket and hydration never touches it. Absent =
   *  use `suggestedBucket`. This is the ONLY user-edited bucket field. */
  bucket?: AdmissionBucket;
```

- [ ] **Step 3: Typecheck.** Run: `cd backend && npx tsc --noEmit` — Expected: PASS (fields are optional; no consumer breaks).

- [ ] **Step 4: Commit.**

```bash
git add backend/shared/data/types.ts
git commit -m "feat(college-buckets): College.bucket + suggestedBucket* fields + AdmissionBucket type"
```

---

## Chunk 2: Bucket AI (pure prompt/parse, model-only)

### Task 2: `suggestBucket` — the AI seam

**Files:**
- Create: `backend/modules/college-hub/bucket-ai.ts`
- Create: `backend/modules/college-hub/bucket-ai.test.ts`

Mirror `prep-ai.ts`: `converseWithSearch(..., { webSearch:false })`, model id from options (→ `BEDROCK_MODEL_ID`), injectable `invoker`, return `undefined` on any failure. The inputs (`acceptanceRateProgram`, `acceptanceRateUniversity`, `avgGPAAdmitted`) are **strings** (e.g. "under 20%") — the PROMPT interprets them; do NOT regex-parse.

- [ ] **Step 1: Write the failing test** `bucket-ai.test.ts`. Use an injected `invoker` that returns canned JSON so no network is hit (see how `prep-ai.test.ts` injects). Cases:

```ts
import { describe, it, expect } from 'vitest';
import { suggestBucket, parseBucketSuggestion } from './bucket-ai.js';

const invokerReturning = (json: string) => async () => ({ text: json, sources: [] as string[] });

describe('parseBucketSuggestion', () => {
  it('parses a valid suggestion', () => {
    expect(parseBucketSuggestion('{"bucket":"reach","rationale":"12% accept","confidence":"high"}'))
      .toEqual({ bucket: 'reach', rationale: '12% accept', confidence: 'high' });
  });
  it('returns undefined on a bad bucket value', () => {
    expect(parseBucketSuggestion('{"bucket":"maybe","rationale":"x","confidence":"low"}')).toBeUndefined();
  });
  it('returns undefined on non-JSON', () => {
    expect(parseBucketSuggestion('the answer is reach')).toBeUndefined();
  });
});

describe('suggestBucket', () => {
  const college = { name: 'Test U', acceptanceRateProgram: '12%', avgGPAAdmitted: '3.8' } as any;
  it('returns the parsed suggestion from the model', async () => {
    const out = await suggestBucket(
      { college, currentGPA: 3.6, gpaType: 'unweighted' },
      { invoker: invokerReturning('{"bucket":"reach","rationale":"below avg + selective","confidence":"medium"}') },
    );
    expect(out?.bucket).toBe('reach');
  });
  it('returns undefined when the college has no acceptance rate AND no admitted GPA', async () => {
    const out = await suggestBucket({ college: { name: 'X' } as any, currentGPA: 3.6 }, { invoker: invokerReturning('{}') });
    expect(out).toBeUndefined(); // nothing to reason from — short-circuits before the model
  });
  it('returns undefined (never throws) when the model errors', async () => {
    const out = await suggestBucket(
      { college, currentGPA: 3.6 },
      { invoker: async () => { throw new Error('bedrock down'); } },
    );
    expect(out).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it — Expected: FAIL** (module not found). Run: `npx vitest run backend/modules/college-hub/bucket-ai.test.ts --exclude '**/agents/**'`

- [ ] **Step 3: Implement `bucket-ai.ts`:**

```ts
// AI admissions-bucket suggestion for a college. Model-only (webSearch:false) — it REASONS over
// numbers we already hydrated (acceptance rate, admitted GPA) against the student's GPA; no web
// search, so it's fast and request-safe. Pure prompt-build + parse; returns undefined on any failure
// or when there's nothing to reason from. Mirrors prep-ai.ts.
import { converseWithSearch } from './converse.js'; // <-- confirm the exact import prep-ai.ts uses
import type { College } from '../../shared/data/index.js';
import { ADMISSION_BUCKETS, type AdmissionBucket } from '../../shared/data/index.js';

export interface BucketSuggestion {
  bucket: AdmissionBucket;
  rationale: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface SuggestBucketInput {
  college: Pick<College, 'name' | 'acceptanceRateProgram' | 'acceptanceRateUniversity' | 'avgGPAAdmitted' | 'isDirectAdmit'>;
  currentGPA?: number;
  gpaType?: 'weighted' | 'unweighted';
}

export interface BucketAiOptions {
  modelId?: string;
  invoker?: unknown;   // match prep-ai.ts AiOptions shape
  searcher?: unknown;
}

const CONFIDENCES = ['low', 'medium', 'high'] as const;

/** Strict parse of the model's JSON. Returns undefined on any shape/enum violation. */
export function parseBucketSuggestion(text: string): BucketSuggestion | undefined {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return undefined;
    const raw = JSON.parse(text.slice(start, end + 1));
    if (!ADMISSION_BUCKETS.includes(raw.bucket)) return undefined;
    if (!CONFIDENCES.includes(raw.confidence)) return undefined;
    if (typeof raw.rationale !== 'string' || !raw.rationale.trim()) return undefined;
    return { bucket: raw.bucket, rationale: raw.rationale.trim().slice(0, 300), confidence: raw.confidence };
  } catch {
    return undefined;
  }
}

export function buildBucketPrompt(input: SuggestBucketInput): string {
  const { college, currentGPA, gpaType } = input;
  const gpaLine = currentGPA != null
    ? `The student's current GPA is ${currentGPA} (${gpaType ?? 'unweighted'}).`
    : `The student's GPA is NOT on file — reason from the college's selectivity alone and set confidence "low".`;
  return [
    `Classify how likely THIS student is to be admitted to this college, as exactly one of: reach, target, safety.`,
    gpaLine,
    `College: ${college.name}.`,
    `Program acceptance rate: ${college.acceptanceRateProgram ?? 'unknown'}.`,
    `University acceptance rate: ${college.acceptanceRateUniversity ?? 'unknown'}.`,
    `Average GPA of admitted students: ${college.avgGPAAdmitted ?? 'unknown'}.`,
    college.isDirectAdmit ? `This is a direct-admit program.` : ``,
    `Guidance: "safety" = high acceptance rate (~>60%) AND the student's GPA at or above the admitted average.`,
    `"reach" = low acceptance rate (~<25%) OR the student's GPA clearly below the admitted average.`,
    `"target" = the student's stats are near the admitted profile with moderate selectivity.`,
    `The rates/GPAs above may be prose like "under 20%" — interpret them; do not expect clean numbers.`,
    `Respond with ONLY a JSON object: {"bucket":"reach|target|safety","rationale":"<=1 sentence citing the numbers","confidence":"low|medium|high"}.`,
  ].filter(Boolean).join('\n');
}

/** Suggest a bucket. Short-circuits to undefined when there is nothing to reason from (no acceptance
 *  rate AND no admitted GPA). Never throws. */
export async function suggestBucket(
  input: SuggestBucketInput,
  options: BucketAiOptions = {},
): Promise<BucketSuggestion | undefined> {
  const { college } = input;
  if (!college.acceptanceRateProgram && !college.acceptanceRateUniversity && !college.avgGPAAdmitted) {
    return undefined;
  }
  try {
    const { text } = await converseWithSearch(buildBucketPrompt(input), {
      feature: 'college-bucket',
      modelId: options.modelId,
      invoker: options.invoker,
      searcher: options.searcher,
      webSearch: false,
      maxTokens: 400,
    });
    return parseBucketSuggestion(text);
  } catch (err) {
    console.error('college-hub: AI bucket suggestion failed', err);
    return undefined;
  }
}
```

> **Implementer note:** open `prep-ai.ts` and copy its EXACT import of `converseWithSearch` and the `AiOptions`/invoker type, so the injected-invoker test path and the `feature` tag match the real seam. Adjust the block above to match.

- [ ] **Step 4: Run the test — Expected: PASS.**

- [ ] **Step 5: Commit.** `git add backend/modules/college-hub/bucket-ai.ts backend/modules/college-hub/bucket-ai.test.ts && git commit -m "feat(college-buckets): suggestBucket AI seam (model-only, undefined-on-error)"`

---

## Chunk 3: Async bucket job + worker routing + hydration integration

### Task 3: `runBucketJob` + worker handler + SQS enqueuer

**Files:**
- Modify: `backend/modules/college-hub/bucket-ai.ts` (append the job + worker + enqueuer — mirror `prep-ai.ts` lines ~167-270)
- Modify: `backend/modules/college-hub/hydration.manifest.ts` (route `task:'bucket'`)
- Modify: `backend/modules/college-hub/hydration.ts` (run a bucket suggestion after each hydrate)
- Modify/Create test: `backend/modules/college-hub/bucket-ai.test.ts`

- [ ] **Step 1: Write failing tests** for `runBucketJob` and `makeBucketWorkerHandler` using the in-memory data client (see how `prep-ai.test.ts` / `handlers.test.ts` build `dataFromMemory`/fixtures). Assert: a `task:'bucket'` message runs the suggester and merges `suggestedBucket*`; a message with a different `task` is a no-op; a college that's gone is a no-op; the merge uses `mergePreservingUserEdits` (so a pre-set `bucket`/`userEdited` is untouched). Also assert the enqueuer sends `{type:'college-hydrate',task:'bucket',collegeId,tenantId,studentId}` (inject an `SqsSender` mock + wrap in `runWithTenant/runWithStudent`).

- [ ] **Step 2: Run — Expected: FAIL.**

- [ ] **Step 3: Implement**, mirroring `prep-ai.ts` exactly:

```ts
// ... append to bucket-ai.ts ...
import { HYDRATION_TYPE } from './hydration.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import type { Data } from '../../shared/data/index.js';

export interface CollegeBucketMessage {
  type: typeof HYDRATION_TYPE;
  collegeId: string;
  task: 'bucket';
  tenantId: string;   // MANDATORY — the worker fail-closes any message missing tenantId/studentId to the DLQ
  studentId: string;
}

/** Suggester seam so tests can inject; production builds the model-only Bedrock one. */
export type BucketSuggester = (input: SuggestBucketInput) => Promise<BucketSuggestion | undefined>;

/** Run one bucket job: read the college + student GPA, suggest, merge (preserving user edits). Never
 *  throws. Idempotent — safe to run twice (it just recomputes suggestedBucket*). No-op if gone. */
export async function runBucketJob(
  getData: () => Data,
  suggester: BucketSuggester | undefined,
  collegeId: string,
): Promise<void> {
  const data = getData();
  const college = await data.colleges.get(collegeId);
  if (!college) return;
  try {
    const profile = await data.studentProfile.get();
    const run = suggester ?? ((i: SuggestBucketInput) => suggestBucket(i));
    const suggestion = await run({ college, currentGPA: profile?.currentGPA, gpaType: profile?.gpaType });
    if (!suggestion) return; // nothing usable — leave the college Unclassified
    await data.colleges.mergePreservingUserEdits(collegeId, {
      suggestedBucket: suggestion.bucket,
      suggestedBucketRationale: suggestion.rationale,
      suggestedBucketConfidence: suggestion.confidence,
    });
  } catch (err) {
    console.error('college-hub: bucket job failed', err);
  }
}

export function makeBucketWorkerHandler(
  getData: () => Data,
  suggester?: BucketSuggester,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<CollegeBucketMessage>;
    if (msg.task !== 'bucket' || typeof msg.collegeId !== 'string' || !msg.collegeId) return;
    await runBucketJob(getData, suggester, msg.collegeId);
  };
}

export type BucketDispatcher = (collegeId: string) => Promise<void>;
export interface SqsSender { send(command: unknown): Promise<unknown>; }
export interface SqsBucketEnqueuerOptions {
  queueUrl?: string;
  client?: SqsSender;
  fallback?: BucketDispatcher;
}

/** Enqueue a bucket job to the FOCUS queue (falls back to hydration queue, then inline). */
export function makeSqsBucketEnqueuer(
  getData: () => Data,
  options: SqsBucketEnqueuerOptions = {},
): BucketDispatcher {
  const fallback = options.fallback ?? ((collegeId: string) => runBucketJob(getData, undefined, collegeId));
  return async (collegeId) => {
    const queueUrl = options.queueUrl ?? process.env.FOCUS_QUEUE_URL ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback(collegeId);
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          type: HYDRATION_TYPE, collegeId, task: 'bucket',
          tenantId: currentTenantId(), studentId: currentStudentId(),
        } as CollegeBucketMessage),
      }));
    } catch {
      await fallback(collegeId);
    }
  };
}
```

- [ ] **Step 4: Route `task:'bucket'` in `hydration.manifest.ts`.** Add `const bucket = makeBucketWorkerHandler(getData);` and, in the `handler`, BEFORE the `prep` line:

```ts
  if (msg.task === 'bucket') return bucket(payload);
  if (msg.task === 'prep') return prep(payload);
```

(Update the `msg` cast to include `task?: unknown` — it already is.)

- [ ] **Step 5: Run a fresh suggestion after each hydrate.** In `hydration.ts`, in BOTH `makeInlineDispatcher` and `makeWorkerHandler`, after `await hydrateCollege(...)`, add `await runBucketJob(getData, undefined, collegeId);` (import `runBucketJob` from `./bucket-ai.js`). This makes a re-hydrated college get a refreshed suggestion. Wrap it so a bucket failure never fails the hydrate (runBucketJob already never throws).

- [ ] **Step 6: Run tests + typecheck — Expected: PASS.** `npx vitest run backend/modules/college-hub --exclude '**/agents/**'` and `cd backend && npx tsc --noEmit`.

- [ ] **Step 7: Commit.** `feat(college-buckets): async bucket job, task:'bucket' worker routing, refresh on hydrate`

---

## Chunk 4: API — PATCH bucket, list filter, auto-enqueue

### Task 4: `PATCH /colleges/:id/bucket` + effective-bucket filter + list back-fill enqueue

**Files:**
- Modify: `backend/modules/college-hub/schema.ts` (bucketSchema + listQuerySchema)
- Modify: `backend/modules/college-hub/query.ts` (`filterColleges` — effective bucket)
- Modify: `backend/modules/college-hub/handlers.ts` (bucket handler + list enqueue)
- Modify: `backend/modules/college-hub/routes.manifest.ts` (route)
- Modify: `backend/modules/college-hub/handlers.test.ts`

- [ ] **Step 1: Schema.** In `schema.ts`, import `ADMISSION_BUCKETS`, and add:

```ts
export const bucketSchema = z.object({ bucket: z.enum(ADMISSION_BUCKETS).nullable() }).strict();
```

Add to `listQuerySchema`: `bucket: z.enum(ADMISSION_BUCKETS).optional(),`.

- [ ] **Step 2: Filter (test-first).** In `query.ts`, in `filterColleges` (the fn `queryColleges` uses), add: when `q.bucket` is set, keep only colleges whose **effective** bucket matches: `(c.bucket ?? c.suggestedBucket) === q.bucket`. Write a unit test in the existing `query.test.ts` for it first (FAIL → implement → PASS).

- [ ] **Step 3: Bucket handler (test-first).** Add to `handlers.test.ts`: `PATCH bucket` with `{bucket:'reach'}` sets `College.bucket`; `{bucket:null}` clears it; a re-hydration (call `runBucketJob`) after an override leaves `bucket` intact and only refreshes `suggestedBucket`; a bad enum → 422. Then implement the handler mirroring `topPick`:

```ts
    // PATCH /colleges/:id/bucket — set/clear the family's admissions-bucket override. `null` reverts
    // to the AI suggestion. Sets College.bucket ONLY (a user field); never touches suggestedBucket*.
    bucket: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const { bucket } = validateBody(bucketSchema, ctx);
      await requireCollege(id);
      const updated = await getData().colleges.update(id, { bucket: bucket ?? undefined });
      return { status: 200, body: updated };
    },
```

> Confirm `colleges.update` with `{ bucket: undefined }` actually removes the attribute; if the hydratable repo ignores `undefined`, use a dedicated clear (e.g. a `REMOVE`-capable update or set to a sentinel the effective-bucket calc treats as "unset"). Add a test that asserts `null` truly reverts the effective bucket to the suggestion.

- [ ] **Step 4: Route.** In `routes.manifest.ts`, after the `top-pick` line: `{ method: 'PATCH', path: '/colleges/:id/bucket', handler: handlers.bucket },`

- [ ] **Step 5: Auto-enqueue on list (test-first).** In the `list` handler, after fetching `items`, fire-and-forget a bucket job for each college that is **hydrated** (`dataAsOf` present) but has no `suggestedBucket` and no `bucket`. Use an injected `bucketDispatcher` (default `makeSqsBucketEnqueuer(getData)`) so it's testable. It MUST NOT break the list:

```ts
      // Back-fill: colleges hydrated before buckets existed get a suggestion the next time the list
      // is viewed. Fire-and-forget; idempotent; never blocks or breaks the response.
      for (const c of items) {
        if (c.dataAsOf && !c.suggestedBucket && !c.bucket) {
          void bucketDispatcher(c.collegeId).catch(() => {});
        }
      }
```

Wire `bucketDispatcher` into `makeHandlers` deps (default to the SQS enqueuer), mirroring how `dispatch`/`assetsDispatch` are injected. Test: enqueues for a hydrated-unbucketed college; does NOT for an already-bucketed or un-hydrated one; a throwing dispatcher doesn't fail the list.

- [ ] **Step 6: Run tests + typecheck — Expected: PASS.**

- [ ] **Step 7: Commit.** `feat(college-buckets): PATCH /colleges/:id/bucket, effective-bucket filter, list back-fill enqueue`

---

## Chunk 5: Frontend — grouped list, badge, picker, filter

### Task 5: Bucket UI in the college hub

**Files (confirm exact names against the module):**
- Modify: `frontend/src/modules/college-hub/api.ts` (add `setBucket`)
- Create: `frontend/src/modules/college-hub/buckets.ts` (pure helpers: effective bucket, grouping, labels/colors)
- Create: `frontend/src/modules/college-hub/BucketBadge.tsx`
- Create: `frontend/src/modules/college-hub/BucketPicker.tsx`
- Modify: the college list component (grouped sections + filter chips)
- Create tests: `buckets.test.ts`, `BucketBadge.test.tsx` (`// @vitest-environment jsdom`)

- [ ] **Step 1: Pure helpers (test-first).** `buckets.ts`:

```ts
export type AdmissionBucket = 'reach' | 'target' | 'safety';
export const BUCKET_ORDER: AdmissionBucket[] = ['reach', 'target', 'safety'];
export const BUCKET_LABEL: Record<AdmissionBucket, string> = { reach: 'Reach', target: 'Target', safety: 'Safety' };
export function effectiveBucket(c: { bucket?: AdmissionBucket; suggestedBucket?: AdmissionBucket }): AdmissionBucket | undefined {
  return c.bucket ?? c.suggestedBucket;
}
export function isOverridden(c: { bucket?: AdmissionBucket }): boolean { return c.bucket != null; }
/** Group colleges into reach/target/safety sections + an 'unclassified' bucket, preserving input order. */
export function groupByBucket<T extends { bucket?: AdmissionBucket; suggestedBucket?: AdmissionBucket }>(colleges: T[]) {
  const groups: Record<AdmissionBucket | 'unclassified', T[]> = { reach: [], target: [], safety: [], unclassified: [] };
  for (const c of colleges) groups[effectiveBucket(c) ?? 'unclassified'].push(c);
  return groups;
}
```

Test `groupByBucket`/`effectiveBucket`/`isOverridden` (override wins over suggestion; unclassified when neither). FAIL → implement → PASS.

- [ ] **Step 2: `setBucket` API (test or manual).** In `api.ts`, mirror the existing top-pick call:

```ts
export const setBucket = (id: string, bucket: AdmissionBucket | null) =>
  api.patch(`/colleges/${id}/bucket`, { bucket }); // confirm the app's api client method/signature
```

- [ ] **Step 3: `BucketBadge.tsx` (test-first, jsdom).** A small pill: label + Field-Notes color (reach=amber, target=evergreen, safety=ink/muted — use existing tokens, NO new icon-circle/card slop per the Field Notes rule). Shows a subtle "set by you" marker when `isOverridden`. Test: renders the effective label; shows the override marker only when `bucket` is set.

- [ ] **Step 4: `BucketPicker.tsx`.** Clicking the badge opens a 3-option selector (Reach/Target/Safety) + the AI rationale as a hint + a "use AI's pick" reset. Selecting calls `setBucket(id, choice)`; reset calls `setBucket(id, null)`. Keep it a plain controlled popover; match existing college-hub interaction patterns.

- [ ] **Step 5: Grouped list + filter chips.** In the college list component: render `groupByBucket(colleges)` as ordered sections **Reach → Target → Safety → Unclassified**, each with a header + count; put a `BucketBadge` on each card. Add a filter chip row (All / Reach / Target / Safety) that filters the rendered set by effective bucket (client-side is fine; the `?bucket=` param is available if a server round-trip is preferred). Preserve existing sort/search behavior within each section.

- [ ] **Step 6: FE typecheck + tests — Expected: PASS.** `cd frontend && npx tsc --noEmit` then `npx vitest run frontend/src/modules/college-hub --exclude '**/agents/**'` (from root).

- [ ] **Step 7: Commit.** `feat(college-buckets): grouped list + bucket badge/picker/filter (frontend)`

---

## Final verification (before PR)

- [ ] Full typecheck: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`.
- [ ] Full test run from root: `npx vitest run --exclude '**/agents/**'` — all green.
- [ ] Lint (flat ESLint; remember NO `eslint-disable react-hooks/*` directives — they error): repo lint command.
- [ ] Route-count guard / manifest test passes (a new route + a new `task` were added).
- [ ] Open a PR into `dev` (per project rules — never `main`); a dev push auto-deploys to staging.
- [ ] On staging: add a college, wait for hydration, confirm a suggested bucket appears; override it; re-hydrate and confirm the override survives; confirm the list groups into sections.

## Notes / gotchas for the implementer

- **Never** mark `suggestedBucket*` as userEdited — always write them via `mergePreservingUserEdits`. `bucket` is the only user field. (The #41 lesson — mixing them will let hydration wipe a family's choice or freeze a stale suggestion.)
- The AI reads **strings** (`"12%"`, `"under 20%"`) — the prompt interprets them; do not add numeric parsing.
- The bucket SQS message MUST include `tenantId` + `studentId` or the worker DLQs it. Only send from inside the active tenant/student context (the list handler runs there).
- Confirm the exact `converseWithSearch` import + `AiOptions` invoker type from `prep-ai.ts` before writing `bucket-ai.ts` — match it 1:1 so the injected-invoker tests and the `feature` tag line up.
- The focus worker loads the same `backend/dist/hydration` bundle, so routing a `task:'bucket'` message there needs no stack change; the API Lambda already has `FOCUS_QUEUE_URL` + send permission.
