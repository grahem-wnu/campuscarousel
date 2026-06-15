# Multi-student Onboarding FTUE + Guided Tour — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the first-time experience into a chat-driven loop that sets up every child in one sitting, then teaches the student switcher with a short guided tour.

**Architecture:** The frontend orchestrates the loop (Approach A); the onboarding chat stays single-student and only gains a `studentCount` signal. A new family-level `/setup` singleton persists the declared count so the loop resumes after an abandon. A localStorage-backed spotlight tour runs once on completion.

**Tech Stack:** Backend — Node 20 / TypeScript, Zod, vitest, single-table DynamoDB via the `Data` layer (tenant/student-scoped decorators). Frontend — React + Vite + Tailwind, shared `api` client, shell slots.

**Spec:** `spec/platform/2026-06-15-multi-student-onboarding-ftue-design.md`

**Tooling — this is a monorepo; ALL commands run from the repo root unless noted:**
- **Tests:** `npm test` runs `vitest run` across the whole repo. Filter to a file/dir with a substring: `npm test -- setup` or a path `npm test -- modules/setup`. (Do NOT `cd backend`/`cd frontend && npm test` — neither workspace has its own `test` script.)
- **Typecheck:** `npm run typecheck` (runs both workspaces). Single workspace: `npm run typecheck -w frontend` / `-w backend`.
- **Manifests:** after adding/removing a backend module, `npm run gen:manifests -w backend` (regenerates `backend/lambda/generated/manifests.ts`).
- **Guards (must pass after any route/data change):** `npm run check:routes` (route guard) and `npm run check:isolation` (tenant-isolation guard). If `check:routes` fails on the new `/setup` routes, follow its message to register/allowlist them.
- **Lint:** `npm run lint` (eslint, whole repo).

**Test environment notes (critical):**
- The root `vitest.config.ts` includes `**/*.{test,spec}.ts` and defaults to the `node` environment. Backend tests are `*.test.ts` and need no changes.
- **Frontend/DOM tests do not work out of the box.** The harness must be set up first (Chunk 0): the include glob must also match `.tsx`, jsdom + Testing Library must be installed, and each DOM test file must start with `// @vitest-environment jsdom`.

**Module + commit conventions:**
- Each backend module: `handlers.ts` (`makeHandlers(deps)` + `buildRoutes`), `schema.ts` (Zod, `.strict()`), `routes.manifest.ts` (lazy `dataFromEnv`), `handlers.test.ts` (vitest + `InMemoryTableClient`).
- Commit after each task. Use the project's git footer (`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).

---

## Chunk 0: Frontend test harness (vitest + Testing Library + jsdom)

**Why:** The frontend has no DOM test setup. The loop/gate/tour logic is the riskiest part of this feature and must be unit-tested. This chunk adds a light, standard harness shared with the existing root vitest runner. Do this FIRST so Chunks 3–5 can TDD.

### Task 0.1: Install + configure the DOM harness

**Files:**
- Modify: `frontend/package.json` (devDependencies)
- Modify: `vitest.config.ts` (root — extend the include glob to `.tsx`; add a jsdom setup file)
- Create: `frontend/src/test/setup.ts` (jest-dom matchers + cleanup)
- Create: `frontend/src/test/smoke.test.tsx` (proves the harness works)

- [ ] **Step 1: Add devDependencies** to `frontend/package.json` (versions compatible with React 18 / vitest 2): `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`. Install from the repo root (`npm install` — workspaces) so the root lockfile updates once.

> Root-lockfile note (see memory): `npm install` will rewrite the root `package-lock.json`. That change is expected and should be committed WITH this task — do not revert it.

- [ ] **Step 2: Extend the root `vitest.config.ts`** so `.tsx` tests are discovered and DOM tests get jest-dom matchers. Keep the default `node` environment (backend unaffected); DOM tests opt in per-file with `// @vitest-environment jsdom`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/cdk.out/**', '.worktrees/**'],
    passWithNoTests: true,
    setupFiles: ['frontend/src/test/setup.ts'],
  },
});
```

> If a global `setupFiles` causes issues for node/backend tests (it should not — it only imports jest-dom, which is harmless), scope it instead via a `vitest.workspace.ts` with two projects (backend: node, frontend: jsdom). Prefer the single-config form above unless a backend test breaks.

- [ ] **Step 3: Create `frontend/src/test/setup.ts`:**

```typescript
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());
```

- [ ] **Step 4: Create `frontend/src/test/smoke.test.tsx`:**

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('frontend test harness', () => {
  it('renders into a DOM', () => {
    render(<button>hello</button>);
    expect(screen.getByRole('button', { name: 'hello' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run it** — `npm test -- smoke` → PASS (1 test). Also re-run the full backend suite `npm test` once to confirm the config change didn't disturb node tests → all green.

- [ ] **Step 6: Commit** — `chore(frontend): add vitest + Testing Library + jsdom test harness` (include the lockfile change).

---

## Chunk 1: Backend — `/setup` family-level singleton

**Why:** Persist the declared kid count + a setup-complete flag so the loop resumes across logins. Family-level (tenant-scoped, not per-child), modeled exactly on `reminderSettings`.

### Task 1.1: `SetupState` type + repo

**Files:**
- Modify: `backend/shared/data/types.ts` (add `SetupState`)
- Modify: `backend/shared/data/collections.ts` (add `SetupStateRepo` + `makeSetupState`)
- Test: `backend/shared/data/collections.test.ts` (or the existing collections test file — confirm name)

- [ ] **Step 1: Write the failing test** — add to the collections test file:

```typescript
import { makeSetupState } from './collections.js';
import { InMemoryTableClient } from './index.js';

describe('setupState repo', () => {
  it('returns null before anything is saved', async () => {
    const repo = makeSetupState(new InMemoryTableClient());
    expect(await repo.get()).toBeNull();
  });

  it('round-trips declaredStudentCount + setupComplete', async () => {
    const repo = makeSetupState(new InMemoryTableClient());
    const saved = await repo.put({ declaredStudentCount: 2 });
    expect(saved.declaredStudentCount).toBe(2);
    expect(await repo.get()).toMatchObject({ declaredStudentCount: 2 });
    const updated = await repo.update({ setupComplete: true });
    expect(updated).toMatchObject({ declaredStudentCount: 2, setupComplete: true });
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `npm test -- collections` → FAIL (`makeSetupState` not exported).

- [ ] **Step 3: Add the type** in `types.ts` (near `ReminderSettings`, ~line 699):

```typescript
/** Family-level FTUE progress: how many kids the family said they'd set up, and whether the
 *  onboarding loop has fully completed. Drives the resume nudge. */
export interface SetupState extends Timestamped {
  declaredStudentCount?: number;
  setupComplete?: boolean;
  updatedBy?: string;
}
```

- [ ] **Step 4: Add the repo** in `collections.ts` (mirror `makeReminderSettings`, ~line 341). Use PK `'SETUP'`, SK `SK_DETAILS`:

```typescript
export interface SetupStateRepo {
  get(): Promise<SetupState | null>;
  put(input: Omit<SetupState, 'createdAt' | 'updatedAt'>): Promise<SetupState>;
  update(patch: Partial<Omit<SetupState, 'createdAt' | 'updatedAt'>>): Promise<SetupState>;
}

export function makeSetupState(client: TableClient): SetupStateRepo {
  const write = async (domain: SetupState): Promise<SetupState> => {
    await client.put({ ...(domain as unknown as Record<string, unknown>), PK: 'SETUP', SK: SK_DETAILS });
    return domain;
  };
  return {
    async get() {
      const item = await client.get('SETUP', SK_DETAILS);
      return item ? toDomain<SetupState>(item) : null;
    },
    async put(input) {
      const existing = await client.get('SETUP', SK_DETAILS);
      const now = isoNow();
      return write({ ...input, createdAt: (existing?.createdAt as string | undefined) ?? now, updatedAt: now });
    },
    async update(patch) {
      const existing = await client.get('SETUP', SK_DETAILS);
      const now = isoNow();
      const current = existing ? toDomain<SetupState>(existing) : ({ createdAt: now } as SetupState);
      return write({ ...current, ...patch, createdAt: current.createdAt ?? now, updatedAt: now });
    },
  };
}
```

> Note: unlike `reminderSettings.update`, `setupState.update` must **upsert** (no throw when absent) — the loop may call `update({setupComplete})` before any `put`.

- [ ] **Step 5: Run test, verify it passes** — `npm test -- collections` → PASS.

- [ ] **Step 6: Commit** — `feat(setup): add SetupState family-level singleton repo`.

### Task 1.2: Wire `setupState` into `Data`

**Files:**
- Modify: `backend/shared/data/index.ts` (add to `Data` interface + `makeData` family-level block, ~line 272)

- [ ] **Step 1: Write the failing test** — in the data index test (find it; e.g. `index.test.ts`), assert `makeData(new InMemoryTableClient()).setupState` exists and round-trips. If no such test file, add a minimal one mirroring an existing repo assertion.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Wire it** — import `makeSetupState`, add `setupState: SetupStateRepo` to the `Data` interface, and add `setupState: makeSetupState(familyClient),` to the **family-level** block in `makeData` (alongside `reminderSettings`, `students`, `members`). It must use `familyClient`, NOT the per-child client.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `feat(setup): wire setupState into the Data layer (family-level)`.

### Task 1.3: `/setup` module (handlers + schema + manifest)

**Files:**
- Create: `backend/modules/setup/schema.ts`
- Create: `backend/modules/setup/handlers.ts`
- Create: `backend/modules/setup/routes.manifest.ts`
- Create: `backend/modules/setup/handlers.test.ts`

- [ ] **Step 1: Write the failing test** (`handlers.test.ts`, mirror `reminders/handlers.test.ts`):

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { makeHandlers, type SetupHandlers } from './handlers.js';

const kate: Requester = { username: 'kate', role: 'parent' };
const keira: Requester = { username: 'keira', role: 'student' };

let data: Data;
let h: SetupHandlers;
beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers({ getData: () => data });
});
const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({ requester: kate, params: {}, query: {}, body: undefined, ...over });

describe('GET /setup', () => {
  it('returns an empty object when nothing saved', async () => {
    const res = await h.get(ctx());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe('PUT /setup', () => {
  it('persists declaredStudentCount (parent)', async () => {
    const res = await h.put(ctx({ body: { declaredStudentCount: 2 } }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ declaredStudentCount: 2 });
    expect(await data.setupState.get()).toMatchObject({ declaredStudentCount: 2 });
  });
  it('forbids a student from writing', async () => {
    await expect(h.put(ctx({ requester: keira, body: { setupComplete: true } }))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Write `schema.ts`:**

```typescript
import { z } from 'zod';

export const setupBodySchema = z
  .object({
    declaredStudentCount: z.number().int().min(1).max(12).optional(),
    setupComplete: z.boolean().optional(),
  })
  .strict();
```

- [ ] **Step 4: Write `handlers.ts`** (mirror reminders; `update` upserts so partial PUTs merge):

```typescript
import { validateBody, type Handler } from '../../shared/api/index.js';
import { requireRole } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';
import { setupBodySchema } from './schema.js';

export interface SetupHandlers { get: Handler; put: Handler; }
export interface SetupDeps { getData: () => Data; }
const requireGuardian = requireRole('admin', 'parent');

export function makeHandlers(deps: SetupDeps): SetupHandlers {
  const { getData } = deps;
  return {
    // GET /setup — family-level FTUE progress (any family role may read; the gate needs it).
    get: async () => ({ status: 200, body: (await getData().setupState.get()) ?? {} }),
    // PUT /setup — parent/admin merge of declaredStudentCount / setupComplete.
    put: async (ctx) => {
      requireGuardian(ctx.requester);
      const patch = validateBody(setupBodySchema, ctx);
      const saved = await getData().setupState.update({ ...patch, updatedBy: ctx.requester.username });
      return { status: 200, body: saved };
    },
  };
}

export function buildRoutes(h: SetupHandlers) {
  return [
    { method: 'GET' as const, path: '/setup', handler: h.get },
    { method: 'PUT' as const, path: '/setup', handler: h.put },
  ];
}
```

- [ ] **Step 5: Write `routes.manifest.ts`** (mirror reminders):

```typescript
import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const h = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = [
  { method: 'GET', path: '/setup', handler: h.get },
  { method: 'PUT', path: '/setup', handler: h.put },
];
```

- [ ] **Step 6: Regenerate manifests** — `npm run gen:manifests -w backend`. Verify `backend/lambda/generated/manifests.ts` now imports `setup/routes.manifest.js`.

- [ ] **Step 7: Run tests + typecheck + guards** — `npm test -- setup`, `npm run typecheck -w backend`, `npm run check:routes`, `npm run check:isolation` → all PASS. (If `check:routes` flags `/setup`, follow its message to register/allowlist the new routes.)

- [ ] **Step 8: Commit** — `feat(setup): add GET/PUT /setup family-level FTUE-progress endpoints`.

---

## Chunk 2: Backend — onboarding chat learns `studentCount`

**Why:** The chat must ask "how many kids?" and surface the answer so the frontend can size the loop. The chat turn is model-produced (not request-validated), so this is a type + prompt + parse change only.

### Task 2.1: Add `studentCount` to the turn

**Files:**
- Modify: `backend/modules/onboarding-chat/ai.ts` (`OnboardingTurn` type; system prompt; the JSON parse/extract)

- [ ] **Step 1: Write the failing test** — in the onboarding-chat ai test (find `ai.test.ts`; if none, add one) drive the `chatter` with a stub `invoker` that returns JSON including `"studentCount": 2` and assert the returned turn has `studentCount === 2`. If the chatter parse is covered elsewhere, add the assertion there.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Extend the type:**

```typescript
export interface OnboardingTurn {
  reply: string;
  profile: OnboardingProfile;
  done: boolean;
  /** How many students the family said they're setting up (captured once, early). */
  studentCount?: number;
}
```

- [ ] **Step 4: Update the system prompt** so the model's FIRST question is "How many students (kids) are you setting up today?", and instruct it to include `studentCount` in its JSON the turn it learns the number and to then set up the CURRENT child only (the frontend loops). Add `studentCount` to the JSON shape the prompt documents.

- [ ] **Step 5: Parse it** — where the model JSON is parsed into `OnboardingTurn`, read an optional integer `studentCount` (clamp 1–12; ignore if absent/invalid). Keep the existing graceful fallback (`handlers.ts:62-64`) untouched.

- [ ] **Step 6: Run tests, verify pass** — `npm test -- onboarding`.

- [ ] **Step 7: Commit** — `feat(onboarding): chat captures studentCount for the multi-kid loop`.

---

## Chunk 3: Frontend — API client (`setup` + `studentCount`)

**Files:**
- Create: `frontend/src/modules/onboarding/setupApi.ts` (or add to `onboarding/api.ts`)
- Modify: `frontend/src/modules/onboarding/api.ts` (`OnboardingTurn` gains `studentCount?`)

### Task 3.1: Setup client + turn type

- [ ] **Step 1: Write the failing test** (if the frontend has a test for `api.ts`; otherwise this is covered by typecheck + the component tests in Chunk 4). Minimal: a test that `getSetup`/`putSetup` call the right path/method via a mocked `api`.

- [ ] **Step 2: Add `studentCount?: number;` to `OnboardingTurn`** in `api.ts`.

- [ ] **Step 3: Add the setup client:**

```typescript
import { api } from '../../shared/api';

export interface SetupState {
  declaredStudentCount?: number;
  setupComplete?: boolean;
}
export const getSetup = () => api.get<SetupState>('/setup');
export const putSetup = (patch: SetupState) => api.put<SetupState>('/setup', patch);
```

- [ ] **Step 4: Typecheck** — `npm run typecheck -w frontend` → PASS.

- [ ] **Step 5: Commit** — `feat(onboarding): frontend setup client + studentCount on the turn`.

---

## Chunk 4: Frontend — the loop (`OnboardingChat` refactor + `OnboardingFlow` + `OnboardingGate`)

**Why:** This is the heart of the change. `OnboardingChat` becomes a dumb single-child interviewer; `OnboardingFlow` owns the loop, student creation, active-student switching, and resume; `OnboardingGate` decides when to open the flow.

### Task 4.1: Make `OnboardingChat` dumb (inject `onFinish`, surface `studentCount`, per-child greeting)

**Files:**
- Modify: `frontend/src/modules/onboarding/OnboardingChat.tsx`

- [ ] **Step 1: Write the failing test** — `OnboardingChat.test.tsx` (React Testing Library; confirm the frontend test setup). Assert: (a) the injected `onFinish` is called with the reviewed profile when the user finishes (NOT `finishOnboarding` directly); (b) when a turn returns `studentCount`, the injected `onStudentCount` is invoked; (c) the greeting reflects a `childOrdinal` prop (e.g. "next" copy when index > 0).

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Refactor `OnboardingChat`:**
  - Props become `{ onFinish: (p: OnboardingProfile) => Promise<void>; onUseForm: () => void; onStudentCount?: (n: number) => void; childIndex?: number }`.
  - Remove the direct `finishOnboarding` import/call; `finish(edited)` now `await onFinish(edited)` (keep the error state handling; the orchestrator throws to surface failures).
  - In `send()`, after merging the turn, if `turn.studentCount != null` call `onStudentCount?.(turn.studentCount)`.
  - Greeting: when `childIndex && childIndex > 0`, use "Great — now let's set up your next child. What grade are they in (or graduation year), and what are they drawn to?".
  - The "Finish & open the dashboard" button label becomes conditional: "Save & set up the next child" when more children remain (pass a `hasMore` prop or derive in the orchestrator by wrapping `onFinish`). Keep it simple: add `finishLabel?: string` prop.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `refactor(onboarding): OnboardingChat is a single-child interviewer with injected finish`.

### Task 4.2: `OnboardingFlow` orchestrator

**Files:**
- Create: `frontend/src/modules/onboarding/OnboardingFlow.tsx`
- Create: `frontend/src/modules/onboarding/OnboardingFlow.test.tsx`

- [ ] **Step 1: Write the failing test** — render `OnboardingFlow` with mocked `api`/context. Scenarios:
  - **Family of 2:** chat reports `studentCount=2` → `putSetup({declaredStudentCount:2})` called; first `onFinish` → `POST /students` then `setActiveStudentId(newId)` then `finishOnboarding` then `reload()`, index advances to child 2; second `onFinish` → second student created, then `putSetup({setupComplete:true})`, `onAllComplete`/`start-tour` fired.
  - **Order assertion:** `setActiveStudentId` is called BEFORE `finishOnboarding` (so seeding is correctly scoped).
  - **Resume:** mounted with `startIndex=1, total=2` (kid 1 already done) → runs one child then completes.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `OnboardingFlow`:**

```tsx
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, useToast } from '../../shared/ui';
import { useActiveStudent } from '../../shared/shell';
import { api } from '../../shared/api';
import OnboardingChat from './OnboardingChat';
import { finishOnboarding, type OnboardingProfile } from './api';
import { putSetup } from './setupApi';
import type { Student } from '../../shared/shell';

export default function OnboardingFlow({
  startIndex = 0,
  initialTotal = 1,
  onClose,
  onAllComplete,
}: {
  startIndex?: number;
  initialTotal?: number;
  onClose: () => void;
  onAllComplete: () => void;
}) {
  const { setActiveStudentId, reload } = useActiveStudent();
  const navigate = useNavigate();
  const toast = useToast();
  const [index, setIndex] = useState(startIndex);
  const [total, setTotal] = useState(initialTotal);
  const totalRef = useRef(initialTotal);

  function handleStudentCount(n: number) {
    if (n >= 1 && n !== totalRef.current) {
      totalRef.current = n;
      setTotal(n);
      void putSetup({ declaredStudentCount: n }).catch(() => {/* non-fatal: resume just won't fire */});
    }
  }

  // Per-child finish: create the roster entry, make it active (scopes X-Student-Id), THEN seed.
  async function handleFinish(profile: OnboardingProfile) {
    const student = await api.post<Student>('/students', {
      name: profile.name ?? `Student ${index + 1}`,
      ...(profile.graduationYear != null ? { graduationYear: profile.graduationYear } : {}),
    });
    setActiveStudentId(student.studentId); // synchronous: stamps X-Student-Id before finish
    await finishOnboarding(profile);       // seeds goals/colleges/budget for this child (async hydration)
    await reload();                        // roster + switcher update
    const next = index + 1;
    if (next >= totalRef.current) {
      await putSetup({ setupComplete: true }).catch(() => {});
      onAllComplete();
      onClose();
      navigate('/dashboard');
      window.dispatchEvent(new Event('onboarding-finished'));
    } else {
      setIndex(next); // remount the chat for the next child via key
    }
  }

  const hasMore = index + 1 < total;
  return (
    <Modal open onClose={onClose} title={total > 1 ? `Set things up — student ${index + 1} of ${total}` : "Let's set things up"} size="lg">
      <OnboardingChat
        key={index}
        childIndex={index}
        finishLabel={hasMore ? 'Save & set up the next child' : 'Finish & open the dashboard'}
        onStudentCount={handleStudentCount}
        onFinish={handleFinish}
        onUseForm={() => {/* fall back handled by the gate's form mode; see Task 4.3 */}}
      />
    </Modal>
  );
}
```

  - Surface errors from `handleFinish` via `toast.error` (wrap in try/catch; rethrow so `OnboardingChat`'s own error UI also shows). Keep failures non-advancing.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `feat(onboarding): OnboardingFlow loop (create→activate→finish→advance)`.

### Task 4.3: `OnboardingGate` opens the flow + resume + zero-student bootstrap

**Files:**
- Modify: `frontend/src/modules/onboarding/OnboardingGate.tsx`

- [ ] **Step 1: Write the failing test** — `OnboardingGate.test.tsx`:
  - **Zero students:** `students=[]`, `activeStudentId=null` → the flow opens (today it does NOT — this is the bug fix).
  - **Resume:** `getSetup` returns `{declaredStudentCount:2}`, roster has 1 onboarded student → flow opens at `startIndex=1, initialTotal=2` after a dismissible "finish setup" prompt is accepted.
  - **Done:** `setupComplete:true` (or roster onboarded count ≥ declared) → flow does NOT open.
  - **Single un-onboarded active student** (existing behavior) → flow opens at index 0.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Update `OnboardingGate`:**
  - Replace the `if (!activeStudentId) return;` early-return: when the roster is empty, open the flow at index 0, total from `getSetup().declaredStudentCount ?? 1` (bootstrap).
  - On auth load, fetch `getSetup()` + use `students` from `useActiveStudent()`. Compute `onboardedCount = students.filter(s => /* profile.onboardingComplete */).length`. Note: the roster `Student` has no `onboardingComplete`; resume must compare the **declared count** against the roster length of *onboarded* kids. Since onboarding-complete lives on the per-child `StudentProfile`, derive "needs resume" as `declaredStudentCount != null && !setupComplete && students.length < declaredStudentCount`. (Roster length is the reliable family-level signal of how many kids exist; profile completeness is enforced by the existing per-student gate.)
  - When resume applies: show a dismissible prompt ("You started setting up N students — finish the rest?"). Accept → render `OnboardingFlow` with `startIndex = students.length`, `initialTotal = declaredStudentCount`. Dismiss → set the session-dismiss flag (mirror `dismissedRef`).
  - Render `OnboardingFlow` instead of the bare `OnboardingChat` modal. Keep the "Prefer a form?" → legacy `Wizard` fallback (single-child; acceptable for the fallback path).
  - `onAllComplete` → mark localStorage so the gate won't reopen, and the tour's `start-tour` event is dispatched by `OnboardingFlow` (Chunk 5 listens).
  - Preserve the existing `open-onboarding` event handler (dashboard "Set up the profile" button) → opens the flow for the active student at index 0, total 1.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Full frontend check** — `npm test -- modules/onboarding && npm run typecheck -w frontend` → PASS.

- [ ] **Step 6: Commit** — `feat(onboarding): gate opens the loop, bootstraps zero-student families, resumes`.

---

## Chunk 5: Frontend — Guided Tour (spotlight + mobile fallback)

**Why:** Teach the switcher (and a few key surfaces) once, after setup. Switcher-first, conditional on ≥2 kids.

### Task 5.1: `tour` slot + `data-tour` anchors

**Files:**
- Modify: `frontend/src/shared/shell/slots.ts` (add `"tour"` to `SlotName`)
- Modify: `frontend/src/shared/shell/AppShell.tsx` (`<SlotOutlet name="tour" placeholder={null} />`; add `data-tour` attributes)
- Modify: `frontend/src/modules/onboarding/nav.manifest.ts` (register the `tour` slot)

- [ ] **Step 1:** Add `"tour"` to the `SlotName` union in `slots.ts`.

- [ ] **Step 2:** In `AppShell.tsx`:
  - Add `data-tour="switcher"` to the `StudentSwitcher` button (`AppShell.tsx:354`).
  - Add `data-tour="ai"` to the AI FAB (`:159`) and `data-tour="quick-add"` to the quick-add FAB (`:167`).
  - Add `data-tour={entry.id}` to the rendered nav link in `TopTab`, `BottomTab`, and `DrawerLink` so nav entries are targetable (steps gracefully skip any anchor not in the DOM).
  - Add `<SlotOutlet name="tour" placeholder={null} />` next to the onboarding slot (`:213`).

- [ ] **Step 3:** In `onboarding/nav.manifest.ts` add `registerSlot('tour', () => import('./GuidedTour'));`.

- [ ] **Step 4: Typecheck** — `npm run typecheck -w frontend` → PASS.

- [ ] **Step 5: Commit** — `feat(tour): add tour slot + data-tour anchors in the shell`.

### Task 5.2: `GuidedTour` component

**Files:**
- Create: `frontend/src/modules/onboarding/GuidedTour.tsx`
- Create: `frontend/src/modules/onboarding/GuidedTour.test.tsx`

- [ ] **Step 1: Write the failing test:**
  - Listens for `start-tour`; on fire, with ≥2 active students and a `[data-tour="switcher"]` element present, renders the switcher step first.
  - With 1 active student, the switcher step is skipped.
  - Steps whose anchor element is absent are skipped (render the JSDOM with only some anchors present).
  - "Skip"/finishing the last step writes `campus-carousel:tourComplete` to localStorage and does not re-run on a later `start-tour` (already-complete short-circuits) — confirm the chosen re-run policy in the test.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `GuidedTour`:**
  - On mount, add a `start-tour` window listener; also optionally auto-start if `localStorage` lacks `campus-carousel:tourComplete` AND the app has ≥1 student (covers a missed event). Decide one trigger to avoid double-start (prefer the explicit event; the gate fires it on completion).
  - Steps (ordered), each `{ key, selector, title, body, condition? }`:
    1. `switcher` → `[data-tour="switcher"]`, condition: `activeStudents >= 2`.
    2. `focus` → `[data-tour="focus"]` (best-effort).
    3. `journal`/why-nursing → its nav id selector (best-effort).
    4. `colleges` → `[data-tour="colleges"]` (best-effort).
    5. `reminders` → `[data-tour="reminders"]` (best-effort).
    - Resolve nav ids from the nav manifests during implementation; any step whose `document.querySelector(selector)` is null is filtered out.
  - **Spotlight (desktop ≥ lg):** fixed dim overlay + a highlight box positioned at the target's `getBoundingClientRect()` + a tooltip card (title, body, "Back"/"Next"/"Skip", step dots). Recompute rect on `resize`/`scroll`.
  - **Mobile (< lg):** render the same steps as a simple centered card sequence (no cutout); skip the rect math.
  - On finish/skip: set `localStorage['campus-carousel:tourComplete'] = '1'`, unmount.
  - No new dependencies — plain React + Tailwind.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `feat(tour): GuidedTour spotlight with mobile fallback, switcher-first`.

### Task 5.3: Wire the gate → tour trigger

**Files:**
- Verify `OnboardingFlow` dispatches `start-tour` on all-complete (Task 4.2) and `GuidedTour` listens (Task 5.2).

- [ ] **Step 1:** Add an integration-ish component test (or extend `OnboardingFlow.test.tsx`): completing the loop dispatches `start-tour`. Keep it light if cross-component wiring is hard to render together.

- [ ] **Step 2: Commit** — `test(tour): loop completion triggers the guided tour`.

---

## Final verification (before handoff to land)

- [ ] `npm test` — whole-repo vitest green (existing 1054+ backend tests + the new backend & frontend tests).
- [ ] `npm run typecheck` — both workspaces green.
- [ ] `npm run check:routes` and `npm run check:isolation` — both pass.
- [ ] `npm run lint` — clean.
- [ ] `npm run gen:manifests -w backend` — no diff (manifest already committed).
- [ ] Manual/dogfood (via `/browse` against a local or staging build): redeem-as-new-family path → "how many kids?" → set up 2 → land on dashboard with 2 onboarded kids → tour fires switcher-first. Refresh after kid 1 → resume nudge → finish kid 2. Family-of-1 → one pass, no switcher step.
- [ ] Privacy/scoping spot-check: confirm kid 2's seeded colleges/goals are scoped to kid 2 (switch students; lists differ).

## Out of scope (YAGNI)

- Per-user/server-side tour state (localStorage only for v1).
- Re-runnable tour from a help menu (could be a one-line follow-up later).
- A dedicated student Cognito login created during onboarding (still parent-driven; unchanged).
- Hard gating of kids 2..N (resume is a soft, dismissible nudge by design).
