# Essay Coach Practice-First Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Essays tab of Application Central into a questions-first essay coach — pick a school, get its real (or clearly-disclosed generic) essay questions, "Write about this one", write, get rubric feedback, edit-and-recheck, and jump back to try another question — with attempts auto-saved per school.

**Architecture:** A rewire of existing `dev` machinery, not a greenfield build. The practice-question generator, rubric review, real hydrated prompts, and never-a-rewrite loop already exist. New: one collegeId-keyed backend route (`POST /essays/practice-questions`, model-only, no async), a new `EssayCoachStart` front-door component, a rewired Essays tab (manual prompt entry removed), and one additive optional `collegeName` field so typed non-roster schools keep their label. Spec: `docs/superpowers/specs/2026-07-10-essay-coach-practice-design.md`.

**Tech Stack:** TypeScript end to end. Backend: Node 20 Lambda, Zod validation, injectable AI seam, `InMemoryTableClient` for unit tests. Frontend: React + Vite + Tailwind, Vitest + React Testing Library (jsdom).

**Conventions to follow:**
- AWS: `--profile wnu` only, region `us-east-2`. No hardcoded config/secrets.
- Backend tests run from `backend/`; frontend tests from `frontend/`. DOM tests need `// @vitest-environment jsdom` as the first line.
- Match existing patterns in `backend/modules/application-central/` and `frontend/src/modules/application-central/` exactly.
- Commit after every green step. Branch is `feat/essay-coach-practice` (off `dev`).

---

## Chunk 1: Backend — questions-first route + `collegeName` field

**File structure for this chunk:**
- Modify: `backend/shared/data/types.ts` — add `collegeName?` to `Essay`.
- Modify: `backend/modules/application-central/schema.ts` — add `collegePracticeSchema`, add `collegeName` to `createSchema`, remove `practiceQuestionsSchema`.
- Modify: `backend/modules/application-central/handlers.ts` — add `practiceQuestionsForCollege`, remove old `practiceQuestions`.
- Modify: `backend/modules/application-central/routes.manifest.ts` — swap the route.
- Modify: `backend/modules/application-central/handlers.test.ts` — replace the old practice test with new coverage.

### Task 1.1: Add `collegeName` to the Essay data type

**Files:**
- Modify: `backend/shared/data/types.ts:461`

- [ ] **Step 1: Add the field**

In `backend/shared/data/types.ts`, in `interface Essay extends Timestamped`, add `collegeName` right after `collegeId`:

```typescript
  collegeId?: string;
  /** Free-text school label for a typed, non-roster practice school (roster essays use collegeId). */
  collegeName?: string;
  prompt?: string;
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS (additive optional field; nothing breaks).

- [ ] **Step 3: Commit**

```bash
git add backend/shared/data/types.ts
git commit -m "feat(essay-coach): add optional collegeName to Essay data type"
```

### Task 1.2: Schema — add `collegePracticeSchema` + `collegeName`, remove old practice schema

**Files:**
- Modify: `backend/modules/application-central/schema.ts:18-28` (createSchema), `:63-68` (remove practiceQuestionsSchema)

- [ ] **Step 1: Add `collegeName` to `createSchema`**

In `createSchema`, after the `collegeId` line:

```typescript
    collegeId: z.string().max(200).optional(),
    collegeName: z.string().max(200).optional(),
```

- [ ] **Step 2: Replace `practiceQuestionsSchema` with `collegePracticeSchema`**

Delete the `practiceQuestionsSchema` block (lines 63-68) and replace with:

```typescript
/** POST /essays/practice-questions — questions-first: sample questions for a college (roster id,
 *  typed name, or general) BEFORE any essay exists. Model-only; safe in the request path. */
export const collegePracticeSchema = z
  .object({
    collegeId: z.string().max(200).optional(),
    collegeName: z.string().max(200).optional(),
    count: z.number().int().min(3).max(8).optional(),
  })
  .strict();
```

- [ ] **Step 3: Typecheck (expect a KNOWN failure)**

Run: `cd backend && npx tsc --noEmit`
Expected: FAIL — `practiceQuestionsSchema` is still imported in `handlers.ts`. That import is removed in Task 1.3. This is the one intentionally-broken intermediate state; proceed to 1.3 before committing.

### Task 1.3: Handler — new `practiceQuestionsForCollege`, remove old `practiceQuestions`

**Files:**
- Modify: `backend/modules/application-central/handlers.ts` — imports (`:20-33`, `:34`), interface (`:59`), handler body (`:223-233`)

- [ ] **Step 1: Write the failing test** (in `handlers.test.ts` — added in full in Task 1.5; if doing strict TDD, add just this describe block first)

Add to `backend/modules/application-central/handlers.test.ts`:

```typescript
describe('practice-questions (questions-first, collegeId-keyed)', () => {
  it('grounds on a roster college and flags usedRealPrompts when it has real prompts', async () => {
    const seen: Array<string | undefined> = [];
    const localH = makeHandlers({
      getData: () => data,
      now,
      practice: async ({ college }) => {
        seen.push(college?.name);
        return { questions: [{ question: 'q', why: 'w', tip: 't' }], source: 'curated' as const };
      },
    });
    const college = await data.colleges.create({
      name: 'Ohio State', status: 'applying', essayPrompts: ['Why nursing at OSU?'],
    } as Parameters<Data['colleges']['create']>[0]);
    const res = await localH.practiceQuestionsForCollege(ctx({ body: { collegeId: college.collegeId } }));
    const body = res.body as { collegeName?: string; usedRealPrompts: boolean; questions: unknown[] };
    expect(seen).toEqual(['Ohio State']);
    expect(body.collegeName).toBe('Ohio State');
    expect(body.usedRealPrompts).toBe(true);
    expect(body.questions).toHaveLength(1);
  });

  it('uses a typed school name with usedRealPrompts=false, and works with no school', async () => {
    const seen: Array<string | undefined> = [];
    const localH = makeHandlers({
      getData: () => data,
      now,
      practice: async ({ college }) => {
        seen.push(college?.name);
        return { questions: [{ question: 'q', why: 'w', tip: 't' }], source: 'ai' as const };
      },
    });
    const typed = await localH.practiceQuestionsForCollege(ctx({ body: { collegeName: 'Imaginary U' } }));
    expect((typed.body as { collegeName?: string; usedRealPrompts: boolean }).collegeName).toBe('Imaginary U');
    expect((typed.body as { usedRealPrompts: boolean }).usedRealPrompts).toBe(false);
    const general = await localH.practiceQuestionsForCollege(ctx({ body: {} }));
    expect((general.body as { usedRealPrompts: boolean }).usedRealPrompts).toBe(false);
    expect(seen).toEqual(['Imaginary U', undefined]);
  });

  it('422s on an unknown body field (strict schema)', async () => {
    await expectStatus(h.practiceQuestionsForCollege(ctx({ body: { bogus: 1 } })), 422);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run modules/application-central/handlers.test.ts -t "questions-first"`
Expected: FAIL — `h.practiceQuestionsForCollege is not a function`.

- [ ] **Step 3: Update imports in `handlers.ts`**

In the `./schema.js` import block, remove `practiceQuestionsSchema,` and add `collegePracticeSchema,` (keep alphabetical-ish order). In the `./grounding.js` import, add the `CollegeContext` type:

```typescript
import { gatherCollegeContext, gatherExperiences, gatherSharedExperiences, type CollegeContext } from './grounding.js';
```

- [ ] **Step 4: Update the handlers interface**

In `interface AppCentralHandlers`, replace `practiceQuestions: Handler;` with:

```typescript
  practiceQuestionsForCollege: Handler;
```

- [ ] **Step 5: Replace the handler body**

Replace the `practiceQuestions` handler (lines 223-233) with:

```typescript
    // POST /essays/practice-questions — questions-first: sample application questions for a college,
    // fetched BEFORE any essay exists. Roster id → real hydrated prompts; typed name → school-styled;
    // neither → Common-App style. Model-only (no web search), safe in the request path.
    // usedRealPrompts is true only when a roster college's real essayPrompts grounded the set.
    practiceQuestionsForCollege: async (ctx) => {
      const body = validateBody(collegePracticeSchema, ctx);
      const data = getData();
      const college: CollegeContext | undefined = body.collegeId
        ? await gatherCollegeContext(data, body.collegeId)
        : body.collegeName
          ? { collegeId: '', name: body.collegeName }
          : undefined;
      const result = await practice({ college, majors: await activeMajors(), count: body.count });
      return {
        status: 200,
        body: { ...result, collegeName: college?.name, usedRealPrompts: (college?.essayPrompts?.length ?? 0) > 0 },
      };
    },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && npx vitest run modules/application-central/handlers.test.ts -t "questions-first"`
Expected: PASS (all 3).

- [ ] **Step 7: Commit**

```bash
git add backend/modules/application-central/schema.ts backend/modules/application-central/handlers.ts backend/modules/application-central/handlers.test.ts
git commit -m "feat(essay-coach): questions-first practice route (collegeId/name/general)"
```

### Task 1.4: Route table — swap the manifest + buildRoutes entries

**Files:**
- Modify: `backend/modules/application-central/routes.manifest.ts:30`
- Modify: `backend/modules/application-central/handlers.ts:414`

- [ ] **Step 1: Update `routes.manifest.ts`**

Replace line 30 (`POST /essays/:id/practice-questions`) with the questions-first route, placed just after `POST /essays` for readability (order is irrelevant to matching — the router keys on method + segment count and sorts static > param):

```typescript
  { method: 'POST', path: '/essays', handler: h.createEssay },
  { method: 'POST', path: '/essays/practice-questions', handler: h.practiceQuestionsForCollege },
```

...and delete the old `{ method: 'POST', path: '/essays/:id/practice-questions', handler: h.practiceQuestions },` line.

- [ ] **Step 2: Update `buildRoutes` in `handlers.ts`**

Mirror the same swap in the `buildRoutes` table (around line 414): remove the `/essays/:id/practice-questions` row, add `{ method: 'POST' as const, path: '/essays/practice-questions', handler: h.practiceQuestionsForCollege },` after the `POST /essays` row.

- [ ] **Step 3: Verify route guard + manifest parity test**

Run: `cd backend && npx vitest run modules/application-central/manifest.test.ts && npm run check:routes`
Expected: PASS — manifest and buildRoutes agree; no duplicate routes.

- [ ] **Step 4: Commit**

```bash
git add backend/modules/application-central/routes.manifest.ts backend/modules/application-central/handlers.ts
git commit -m "feat(essay-coach): register /essays/practice-questions, drop :id practice route"
```

### Task 1.5: Fix the pre-existing test that used the old handler + full backend green

**Files:**
- Modify: `backend/modules/application-central/handlers.test.ts:124-143`

- [ ] **Step 1: Update the old "passes the linked college to the finder and practice generator" test**

That test (around lines 124-143) calls `localH.practiceQuestions(ctx({ params: { id: ... } }))`. The `/essays/:id/practice-questions` handler is gone. Change the two `practiceQuestions` calls to the new signature — no essay needed, pass `collegeId` / no college directly:

```typescript
    const pq = await localH.practiceQuestionsForCollege(ctx({ body: { collegeId } }));
    // ...assert seen includes the college name as before...
    const pq2 = await localH.practiceQuestionsForCollege(ctx({ body: {} }));
```

Keep the finder assertion (still via `findExperiences` on a linked essay). Remove any now-dead essay creation that only existed to call the old practice route.

- [ ] **Step 2: Run the whole module test suite**

Run: `cd backend && npx vitest run modules/application-central/`
Expected: PASS (all files green, including `ai.test.ts`, `handlers.test.ts`, `manifest.test.ts`).

- [ ] **Step 3: Full backend typecheck + tests**

Run: `cd backend && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/modules/application-central/handlers.test.ts
git commit -m "test(essay-coach): migrate practice-generator test to questions-first handler"
```

---

## Chunk 2: Frontend data layer — types, api, grouping logic

**File structure for this chunk:**
- Modify: `frontend/src/modules/application-central/types.ts` — `usedRealPrompts`, `collegeName`.
- Modify: `frontend/src/modules/application-central/api.ts` — add `getPracticeQuestionsForCollege`, remove `getPracticeQuestions`.
- Modify: `frontend/src/modules/application-central/logic.ts` + `logic.test.ts` — add `groupEssaysByCollege`.

### Task 2.1: Frontend types

**Files:**
- Modify: `frontend/src/modules/application-central/types.ts:25-48` (Essay/EssayInput), `:92-96` (PracticeQuestionSet)

- [ ] **Step 1: Add the fields**

- In `interface Essay`, after `collegeId?: string;` add `collegeName?: string;`.
- In `interface EssayInput`, after `collegeId?: string;` add `collegeName?: string;`.
- In `interface PracticeQuestionSet`, add `usedRealPrompts?: boolean;`.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/application-central/types.ts
git commit -m "feat(essay-coach): FE types — usedRealPrompts + essay collegeName"
```

### Task 2.2: API client — questions-first fetch

**Files:**
- Modify: `frontend/src/modules/application-central/api.ts:59-61`

- [ ] **Step 1: Replace `getPracticeQuestions`**

Remove the `getPracticeQuestions(id, count)` function and add:

```typescript
/** Questions-first: sample questions for a college BEFORE an essay exists. */
export function getPracticeQuestionsForCollege(
  input: { collegeId?: string; collegeName?: string; count?: number } = {},
): Promise<PracticeQuestionSet> {
  return api.post<PracticeQuestionSet>('/essays/practice-questions', input);
}
```

- [ ] **Step 2: Typecheck (expect KNOWN failures in EssayWorkspace)**

Run: `cd frontend && npx tsc --noEmit`
Expected: FAIL — `EssayWorkspace.tsx` and `EssayWorkspace.test.tsx` still import `getPracticeQuestions`. Fixed in Chunk 3 (Task 3.3). Do not commit yet; finish Task 2.3 first, then this compiles clean only after Chunk 3. To keep commits green, commit this together with Task 3.3, OR temporarily leave `getPracticeQuestions` in place and remove it in 3.3.

> **Sequencing note:** To keep every commit green, KEEP `getPracticeQuestions` for now (add the new function alongside it) and delete it in Task 3.3 when its last caller is gone. Adjust Step 1 accordingly: add the new function, don't remove the old one yet.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/application-central/api.ts
git commit -m "feat(essay-coach): add getPracticeQuestionsForCollege API client"
```

### Task 2.3: Grouping logic — attempts by school

**Files:**
- Modify: `frontend/src/modules/application-central/logic.ts`
- Test: `frontend/src/modules/application-central/logic.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `logic.test.ts`:

```typescript
import { groupEssaysByCollege } from './logic';
import type { Essay } from './types';

const mk = (over: Partial<Essay>): Essay => ({ essayId: 'x', createdAt: '', updatedAt: '', ...over });

describe('groupEssaysByCollege', () => {
  it('groups by resolved school label and falls back to General practice', () => {
    const essays = [
      mk({ essayId: 'a', collegeId: 'osu' }),
      mk({ essayId: 'b', collegeId: 'osu' }),
      mk({ essayId: 'c', collegeName: 'Imaginary U' }),
      mk({ essayId: 'd' }),
    ];
    const label = (e: Essay) =>
      e.collegeId === 'osu' ? 'Ohio State' : e.collegeName ?? 'General practice';
    const groups = groupEssaysByCollege(essays, label);
    expect(groups.map((g) => g.label)).toEqual(['Ohio State', 'Imaginary U', 'General practice']);
    expect(groups[0]!.essays.map((e) => e.essayId)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/modules/application-central/logic.test.ts -t groupEssaysByCollege`
Expected: FAIL — `groupEssaysByCollege` is not exported.

- [ ] **Step 3: Implement**

Add to `logic.ts`:

```typescript
/** Group essays into per-school buckets for the attempts view. `labelFor` resolves each essay's
 *  display label (roster name by collegeId, else its typed collegeName, else "General practice").
 *  Insertion-ordered: a school's first attempt fixes its position. */
export function groupEssaysByCollege(
  essays: Essay[],
  labelFor: (essay: Essay) => string,
): Array<{ label: string; essays: Essay[] }> {
  const groups = new Map<string, Essay[]>();
  for (const essay of essays) {
    const label = labelFor(essay);
    const bucket = groups.get(label);
    if (bucket) bucket.push(essay);
    else groups.set(label, [essay]);
  }
  return [...groups.entries()].map(([label, list]) => ({ label, essays: list }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/modules/application-central/logic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/application-central/logic.ts frontend/src/modules/application-central/logic.test.ts
git commit -m "feat(essay-coach): groupEssaysByCollege for the attempts view"
```

---

## Chunk 3: Frontend UI — front door, rewired tab, workspace cleanup

**File structure for this chunk:**
- Create: `frontend/src/modules/application-central/EssayCoachStart.tsx` — questions-first front door (school picker → question list → "Write about this one").
- Create: `frontend/src/modules/application-central/EssayCoachStart.test.tsx`.
- Modify: `frontend/src/modules/application-central/ApplicationCentralPage.tsx` — remove the paste-prompt modal; wire `EssayCoachStart`; group attempts by school.
- Modify: `frontend/src/modules/application-central/ApplicationCentralPage.test.tsx` (create if absent).
- Modify: `frontend/src/modules/application-central/EssayWorkspace.tsx` + `EssayWorkspace.test.tsx` — delete dead practice code; add "Try a different question".

### Task 3.1: `EssayCoachStart` — the questions-first front door

**Files:**
- Create: `frontend/src/modules/application-central/EssayCoachStart.tsx`
- Test: `frontend/src/modules/application-central/EssayCoachStart.test.tsx`

**Component contract:**
```typescript
interface Props {
  colleges: CollegeOption[];          // roster, for the Hub-first picker
  initialCollegeId?: string;          // pre-seed from "Start an essay" on the overview tab
  onWrite: (essay: Essay) => void;    // created attempt → open the workspace
  onCancel: () => void;               // back to the attempts list / empty state
}
```
Two internal steps: `'pick'` (school picker: roster list + "Practice on a different school" text input + "General practice (no school)") → `'questions'` (fetch via `getPracticeQuestionsForCollege`, render cards, disclosure banner when `usedRealPrompts === false`). "Write about this one" → `createEssay({ collegeId?, collegeName?, prompt: question, promptSource })` then `onWrite`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/modules/application-central/EssayCoachStart.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EssayCoachStart } from './EssayCoachStart';
import type { CollegeOption } from './types';

const { getPracticeQuestionsForCollege, createEssay } = vi.hoisted(() => ({
  getPracticeQuestionsForCollege: vi.fn(),
  createEssay: vi.fn(),
}));
vi.mock('./api', () => ({ getPracticeQuestionsForCollege, createEssay }));

const colleges: CollegeOption[] = [{ collegeId: 'osu', name: 'Ohio State', essayPrompts: ['Why nursing at OSU?'] }];

describe('EssayCoachStart', () => {
  it('shows a roster school → its real questions (no disclosure) → "Write about this one" creates the attempt', async () => {
    getPracticeQuestionsForCollege.mockResolvedValue({
      questions: [{ question: 'Why nursing at OSU?', why: 'w', tip: 't' }],
      source: 'curated', collegeName: 'Ohio State', usedRealPrompts: true,
    });
    createEssay.mockResolvedValue({ essayId: 'e1', collegeId: 'osu', prompt: 'Why nursing at OSU?', createdAt: '', updatedAt: '' });
    const onWrite = vi.fn();
    render(<EssayCoachStart colleges={colleges} onWrite={onWrite} onCancel={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /Ohio State/ }));
    expect(await screen.findByText('Why nursing at OSU?')).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t find/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /write about this one/i }));
    expect(createEssay).toHaveBeenCalledWith(
      expect.objectContaining({ collegeId: 'osu', prompt: 'Why nursing at OSU?', promptSource: 'college' }),
    );
    expect(onWrite).toHaveBeenCalledWith(expect.objectContaining({ essayId: 'e1' }));
  });

  it('shows the disclosure banner and uses collegeName for a typed school with usedRealPrompts=false', async () => {
    getPracticeQuestionsForCollege.mockResolvedValue({
      questions: [{ question: 'A general prompt', why: 'w', tip: 't' }],
      source: 'ai', collegeName: 'Imaginary U', usedRealPrompts: false,
    });
    createEssay.mockResolvedValue({ essayId: 'e2', collegeName: 'Imaginary U', prompt: 'A general prompt', createdAt: '', updatedAt: '' });
    const onWrite = vi.fn();
    render(<EssayCoachStart colleges={colleges} onWrite={onWrite} onCancel={() => {}} />);

    await userEvent.type(screen.getByLabelText(/different school/i), 'Imaginary U');
    await userEvent.click(screen.getByRole('button', { name: /see questions/i }));
    expect(await screen.findByText(/couldn.t find .*Imaginary U.*current essay questions/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /write about this one/i }));
    expect(getPracticeQuestionsForCollege).toHaveBeenCalledWith(expect.objectContaining({ collegeName: 'Imaginary U' }));
    expect(createEssay).toHaveBeenCalledWith(
      expect.objectContaining({ collegeName: 'Imaginary U', promptSource: 'practice' }),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/modules/application-central/EssayCoachStart.test.tsx`
Expected: FAIL — module `./EssayCoachStart` not found.

- [ ] **Step 3: Implement `EssayCoachStart.tsx`**

Create the component. Follow the module's existing UI imports (`Button`, `Card`, `Field`, `Select`, `Spinner`, `EmptyState` from `../../shared/ui`) and copy the Field-Notes styling idiom from `ApplicationCentralPage.tsx` / `EssayWorkspace.tsx` (no icon-circles/card-grid slop). Full reference implementation:

```typescript
import { useState } from 'react';
import { Button, Card, Field, Input, Select, Spinner } from '../../shared/ui';
import { createEssay, getPracticeQuestionsForCollege } from './api';
import type { CollegeOption, Essay, PracticeQuestionSet } from './types';

interface Props {
  colleges: CollegeOption[];
  initialCollegeId?: string;
  onWrite: (essay: Essay) => void;
  onCancel: () => void;
}

const GENERAL = '__general__';
const TYPED = '__typed__';

/** Questions-first front door for the essay coach: pick a school, get its real (or clearly-disclosed
 *  generic) essay questions, then "Write about this one" to start a coached practice attempt. */
export function EssayCoachStart({ colleges, initialCollegeId, onWrite, onCancel }: Props) {
  const [pick, setPick] = useState<string>(initialCollegeId ?? '');
  const [typedName, setTypedName] = useState('');
  const [set, setSet] = useState<PracticeQuestionSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [writingIdx, setWritingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roster = colleges.find((c) => c.collegeId === pick);

  async function loadQuestions() {
    setLoading(true);
    setError(null);
    try {
      const input =
        pick === TYPED ? { collegeName: typedName.trim() } : pick === GENERAL || !pick ? {} : { collegeId: pick };
      setSet(await getPracticeQuestionsForCollege(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load practice questions.');
    } finally {
      setLoading(false);
    }
  }

  async function write(question: string, idx: number) {
    setWritingIdx(idx);
    setError(null);
    try {
      const essay = await createEssay({
        collegeId: pick && pick !== TYPED && pick !== GENERAL ? pick : undefined,
        collegeName: pick === TYPED ? typedName.trim() : undefined,
        prompt: question,
        promptSource: set?.usedRealPrompts ? 'college' : 'practice',
      });
      onWrite(essay);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the essay.');
      setWritingIdx(null);
    }
  }

  // Step 2 — questions
  if (set) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => setSet(null)}>← Pick a different school</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
        {set.usedRealPrompts === false ? (
          <Card className="border border-secondary-200 bg-secondary-50">
            <p className="text-sm text-ink-700">
              I couldn’t find {set.collegeName ?? 'this school'}’s current essay questions, so these are general
              practice prompts of the kind admissions essays ask.
            </p>
          </Card>
        ) : null}
        <div className="space-y-2">
          {set.questions.map((q, i) => (
            <Card key={i} className="space-y-1.5">
              <p className="font-serif text-base text-ink-900">{q.question}</p>
              {q.why ? <p className="text-xs text-ink-500">{q.why}</p> : null}
              {q.tip ? <p className="text-xs italic text-primary-700">Tip: {q.tip}</p> : null}
              <div>
                <Button size="sm" loading={writingIdx === i} onClick={() => void write(q.question, i)}>
                  Write about this one
                </Button>
              </div>
            </Card>
          ))}
        </div>
        {error ? <p className="text-sm text-error-600">{error}</p> : null}
      </div>
    );
  }

  // Step 1 — school picker
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink-900">Essay coach</h2>
        <p className="mt-0.5 text-sm text-ink-600">
          Practice writing real admissions essays. Pick a school — I’ll pull up the kinds of questions it
          asks, you write, and I coach you. I never write the essay for you.
        </p>
      </div>
      <Field label="School">
        <Select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose a school…</option>
          {colleges.map((c) => (
            <option key={c.collegeId} value={c.collegeId}>{c.name}</option>
          ))}
          <option value={TYPED}>Practice on a different school…</option>
          <option value={GENERAL}>General practice (no school)</option>
        </Select>
      </Field>
      {pick === TYPED ? (
        <Field label="Which school? (different school)">
          <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="e.g. Duke University" />
        </Field>
      ) : null}
      <div className="flex gap-2">
        <Button
          loading={loading}
          disabled={!pick || (pick === TYPED && !typedName.trim())}
          onClick={() => void loadQuestions()}
        >
          See questions
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      {roster?.essayPrompts?.length ? (
        <p className="text-xs text-ink-400">{roster.name} has {roster.essayPrompts.length} real prompt(s) on file.</p>
      ) : null}
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
    </Card>
  );
}
```

> Verify `Input` is the correct export name in `../../shared/ui` (grep the shared UI barrel). If the text input primitive is named differently (e.g. `TextInput`), use that. The `aria-label` the test queries (`/different school/i`) comes from the `Field label`; keep the label text containing "different school".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/modules/application-central/EssayCoachStart.test.tsx`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/application-central/EssayCoachStart.tsx frontend/src/modules/application-central/EssayCoachStart.test.tsx
git commit -m "feat(essay-coach): EssayCoachStart questions-first front door"
```

### Task 3.2: Rewire `ApplicationCentralPage` — remove the paste-prompt modal, wire the front door + attempts

**Files:**
- Modify: `frontend/src/modules/application-central/ApplicationCentralPage.tsx`
- Test: `frontend/src/modules/application-central/ApplicationCentralPage.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `ApplicationCentralPage.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ApplicationCentralPage from './ApplicationCentralPage';

const { listEssays, listCollegeOptions } = vi.hoisted(() => ({
  listEssays: vi.fn(),
  listCollegeOptions: vi.fn(),
}));
vi.mock('./api', () => ({ listEssays, listCollegeOptions, createEssay: vi.fn(), getPracticeQuestionsForCollege: vi.fn() }));
// Stub the heavy sub-views so the test focuses on the Essays tab.
vi.mock('./ApplicationOverview', () => ({ ApplicationOverview: () => <div /> }));
vi.mock('./RecommendationBoard', () => ({ RecommendationBoard: () => <div /> }));
vi.mock('./TestScoreTracker', () => ({ TestScoreTracker: () => <div /> }));
vi.mock('./DecisionMatrix', () => ({ DecisionMatrix: () => <div /> }));

describe('ApplicationCentralPage — Essays tab', () => {
  it('empty state shows the coach intro + Start practicing, and opens the front door (no paste-prompt modal)', async () => {
    listEssays.mockResolvedValue([]);
    listCollegeOptions.mockResolvedValue([]);
    render(<ApplicationCentralPage />);
    await userEvent.click(await screen.findByRole('tab', { name: /essays/i }));
    await userEvent.click(await screen.findByRole('button', { name: /start practicing/i }));
    // The front door renders; the old "Paste the essay prompt" textarea must be gone.
    expect(await screen.findByText(/pick a school/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/paste the essay prompt/i)).not.toBeInTheDocument();
  });
});
```

> Note the exact selectors: `Tabs` renders `role="tab"`; adjust `getByRole('tab', …)` if the shared `Tabs` uses buttons (grep `shared/ui` Tabs). If the coach intro copy differs, match the actual text. Keep the assertions behavioral (front door appears, paste-prompt gone).

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/modules/application-central/ApplicationCentralPage.test.tsx`
Expected: FAIL — no "Start practicing" button yet.

- [ ] **Step 3: Implement the rewire**

In `ApplicationCentralPage.tsx`:
- Remove the `Modal`/`Field`/`Select`/`Textarea` import usages tied to the create modal, the `showNew`/`prompt`/`collegeId`/`creating` state, the `suggestedPrompts` memo, and the `create()` function and its `<Modal>` block (lines ~156-184).
- Add `const [starting, setStarting] = useState(false)` and `const [startCollegeId, setStartCollegeId] = useState<string | undefined>(undefined)`.
- Import `EssayCoachStart` and `groupEssaysByCollege`.
- **Empty state** (`essays.length === 0`): render a coach intro + a **"Start practicing"** button that sets `setStarting(true)`.
- **Populated state**: render **"Your attempts"** grouped via `groupEssaysByCollege(essays, labelFor)`, where `labelFor(e) = e.collegeId ? (collegeName(e.collegeId) ?? e.collegeName ?? e.collegeId) : (e.collegeName ?? 'General practice')`. Keep each attempt row's existing button (opens the workspace via `setSelected(e)`). Add a **"Practice a new essay"** button → `setStarting(true)`.
- When `starting` is true (and no essay `selected`), render `<EssayCoachStart colleges={colleges} initialCollegeId={startCollegeId} onWrite={(e) => { setStarting(false); setSelected(e); void load(); }} onCancel={() => setStarting(false)} />` in place of the list.
- `ApplicationOverview.onStartEssay(cid)`: `setTab('essays'); setStartCollegeId(cid); setStarting(true);` (replaces the old modal open).

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `cd frontend && npx vitest run src/modules/application-central/ApplicationCentralPage.test.tsx && npx tsc --noEmit`
Expected: test PASS; tsc still FAILS only on `EssayWorkspace` (old `getPracticeQuestions`) — fixed next task.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/application-central/ApplicationCentralPage.tsx frontend/src/modules/application-central/ApplicationCentralPage.test.tsx
git commit -m "feat(essay-coach): questions-first Essays tab + per-school attempts"
```

### Task 3.3: `EssayWorkspace` — delete dead practice code, add "Try a different question"

**Files:**
- Modify: `frontend/src/modules/application-central/EssayWorkspace.tsx`
- Modify: `frontend/src/modules/application-central/EssayWorkspace.test.tsx`
- Modify: `frontend/src/modules/application-central/api.ts` (remove `getPracticeQuestions` now that its last caller is gone)

- [ ] **Step 1: Add an `onTryAnother` prop + failing test**

The workspace needs a way back to the question list. Add `onTryAnother?: () => void` to `EssayWorkspace` `Props`. Update `EssayWorkspace.test.tsx`: remove the `getPracticeQuestions` mock and any "practice questions" assertions (that path moved to `EssayCoachStart`); add a test that clicking **"Try a different question"** auto-saves the current draft then calls `onTryAnother`:

```typescript
it('auto-saves then returns to questions on "Try a different question"', async () => {
  addDraft.mockResolvedValue({ ...essay });
  const onTryAnother = vi.fn();
  render(<EssayWorkspace essay={essay} onChanged={vi.fn()} onBack={() => {}} onTryAnother={onTryAnother} />);
  await userEvent.click(screen.getByRole('button', { name: /try a different question/i }));
  expect(addDraft).toHaveBeenCalled();          // current text preserved as an attempt
  expect(onTryAnother).toHaveBeenCalled();
});
```

(Ensure `addDraft` is in the `vi.hoisted`/`vi.mock('./api', …)` mock for this file.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/modules/application-central/EssayWorkspace.test.tsx -t "Try a different question"`
Expected: FAIL — no such button.

- [ ] **Step 3: Implement**

In `EssayWorkspace.tsx`:
- Delete the `getPracticeQuestions` import; delete `practice`/`practicing` state (lines ~34-35), `runPractice()` (lines ~66-76), and the practice render block (lines ~220-235).
- Change the sidebar button from "Practice questions" to **"Try a different question"** (only when `onTryAnother` is provided): on click, `if (text.trim()) await saveDraft(); onTryAnother?.();`.
- Add `onTryAnother?: () => void` to `Props`.

In `ApplicationCentralPage.tsx`, pass `onTryAnother={() => { setSelected(null); setStartCollegeId(selected?.collegeId); setStarting(true); }}` to `<EssayWorkspace>`.

In `api.ts`, delete the now-callerless `getPracticeQuestions` function (from Task 2.2's alongside-add).

- [ ] **Step 4: Run tests + full frontend typecheck**

Run: `cd frontend && npx vitest run src/modules/application-central/ && npx tsc --noEmit`
Expected: PASS; tsc clean (no more `getPracticeQuestions`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/application-central/EssayWorkspace.tsx frontend/src/modules/application-central/EssayWorkspace.test.tsx frontend/src/modules/application-central/api.ts frontend/src/modules/application-central/ApplicationCentralPage.tsx
git commit -m "feat(essay-coach): workspace 'Try a different question'; drop dead practice code"
```

### Task 3.4: Full green + manual verification

- [ ] **Step 1: Whole-repo typecheck + tests**

Run: `cd backend && npx tsc --noEmit && npx vitest run` then `cd ../frontend && npx tsc --noEmit && npx vitest run`
Expected: PASS both.

- [ ] **Step 2: Lint**

Run the repo's lint command (e.g. `npm run lint` from the monorepo root).
Expected: PASS.

- [ ] **Step 3: Manual end-to-end (staging or local dev)**

Drive the real flow (use `/run` or the browse skill). Verify, per the spec's Testing section:
1. Essays tab empty → coach intro + "Start practicing".
2. Roster school **with** real prompts → questions show, **no** disclosure banner; "Write about this one" opens the workspace with that question at top.
3. Roster school **without** prompts, and a **typed** school → disclosure banner shows; typed school's attempt keeps its label in "Your attempts".
4. General practice (no school) → Common-App-style questions.
5. Coach my essay → rubric bars + /10 + verdict + strengths/improvements; never a rewrite.
6. "Try a different question" → current draft is preserved (appears under the school's attempts), returns to the question list.
7. Applications/Recommenders/Test scores/Decisions tabs unchanged.

- [ ] **Step 4: Final commit (if any manual-fix tweaks)**

```bash
git add -A && git commit -m "test(essay-coach): manual QA fixes"   # only if needed
```

---

## Execution notes
- Every commit must be green (typecheck + touched tests). The two intentional intermediate states are called out (Task 1.2 → 1.3, and the "keep `getPracticeQuestions` until Task 3.3" note); follow the sequencing notes to avoid red commits.
- After all chunks: push `feat/essay-coach-practice` and open a PR into `dev` (never `main`). Per CLAUDE.md standing authorization, a green branch may be merged to `dev` (auto-deploys to staging) without asking — announce the PR link when done.
- Grep-verify shared UI export names (`Input`/`TextInput`, `Tabs` role) before relying on the reference code; adjust to the actual primitives.
