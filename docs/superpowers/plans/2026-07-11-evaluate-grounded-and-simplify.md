# Evaluate-Grounded + Workspace Simplification — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make async essay **Evaluate** read the student's privacy-filtered logged experiences and name where the essay omits/underuses them (removing the separate "Find relevant experiences" button), and strip the workspace to editor + word count + Copy + Evaluate (repeatable) with a single autosaved body.

**Architecture:** Backend — thread the caller identity onto the `EssayReviewJob`, reconstruct a `Requester` in the worker, gather privacy-filtered experiences, feed them to the reviewer prompt; guard the persisted result with creator-only read. Frontend — trim `EssayWorkspace` and switch to a single autosaved body. Spec: `docs/superpowers/specs/2026-07-11-evaluate-grounded-and-simplify.md`.

**Tech Stack:** TS; Zod; DynamoDB single-table; Vitest + RTL (jsdom). Privacy helpers: `backend/shared/auth` (`Requester={username,role}`, `aiVisibleSet`), `backend/modules/application-central/grounding.ts` (`gatherExperiences`, `poolToText`, `ExperiencePool`).

**Conventions:** AWS `--profile wnu`, `us-east-2`, confirm account `010928187255` before deploy. Tests from repo ROOT (`cd /mnt/c/Keira/keiras-journey && npx vitest run <path> --exclude '**/agents/**'`); typecheck from workspace dir; `npm run check:routes` from root. Every commit green. Branch `feat/evaluate-grounded-simplify` (off dev). No `npm install`; revert `.gitignore`/`.gstack` churn.

---

## Chunk A: Backend — grounded evaluation + privacy guard

### Task A1: Job carries the caller identity
**Files:** `backend/shared/data/types.ts`
- [ ] **Step 1:** Add to `EssayReviewJob` (which already has jobId/essayId/content?/targetWords?/status/result?/error?):
```typescript
  reviewerUsername: string;
  reviewerRole: Role;   // Role is already exported from this file
```
- [ ] **Step 2:** `cd backend && npx tsc --noEmit` → expect FAIL only where `startReview` creates the job without these (fixed in A4) — do not commit yet; this task's commit is folded with A4. (Or add the fields as optional temporarily — NO, keep required and commit A1–A4 together at A4 Step 5.)

### Task A2: Reviewer reads the experience pool
**Files:** `backend/modules/application-central/ai.ts`
- [ ] **Step 1: Write failing test** (in `ai.test.ts`): `buildReviewPrompt` with a `pool` includes the experience text (`poolToText`) and a "name a real logged experience" instruction; without a pool it does not. (Use a small `ExperiencePool` fixture.)
- [ ] **Step 2:** Extend the `EssayReviewer` input type (`ai.ts:72-77`) with `pool?: ExperiencePool` (import `ExperiencePool` — already imported at `ai.ts:13`). Update `buildReviewPrompt` (`ai.ts:263`) signature to accept `pool?: ExperiencePool` and, when present, append before the essay draft:
```typescript
    input.pool && input.pool.experiences.length
      ? `The student's REAL logged experiences (use ONLY these; never invent details):\n${poolToText(input.pool)}\nIn "improvements", name specific logged experiences the essay omits or underuses, or where it stays generic instead of drawing on this real material. Reference experiences by their title.`
      : '',
```
`makeBedrockEssayReviewer` passes `input` (which now carries `pool`) straight through — no other change; output shape unchanged (notes fold into `improvements`).
- [ ] **Step 3: Update the stale comment** at `ai.ts:6-9`: the review result (with private-derived improvements) is now persisted on the creator-guarded `EssayReviewJob`; `lastReview` stays scores-only.
- [ ] **Step 4:** Run the ai test → pass; `tsc` clean (this file compiles standalone). Commit: `feat(essay-center): essay reviewer can ground feedback in logged experiences`

### Task A3: Worker gathers privacy-filtered experiences
**Files:** `backend/modules/application-central/review.ts`, `review.test.ts`
- [ ] **Step 1: Update the failing tests** in `review.test.ts`: `runReviewJob` for a job with `reviewerRole:'student'` passes a pool INCLUDING private entries to the reviewer; a job with `reviewerRole:'parent'` passes a pool WITHOUT private entries. (Seed a private + a family activity via `data.activities.create`, inject a reviewer spy that captures `input.pool`, assert on `pool.includesPrivate` / counts.)
- [ ] **Step 2:** In `runReviewJob` (`review.ts:19-47`), after loading the job, add:
```typescript
    const requester = { username: job.reviewerUsername, role: job.reviewerRole };
    const pool = await gatherExperiences(data, requester);
```
and pass `pool` into the `reviewer({ prompt, content, targetWords, college, pool })` call. Import `gatherExperiences` from `./grounding.js` (already imports `gatherCollegeContext` from there).
- [ ] **Step 3: Update the stale comment** at `grounding.ts:1-5`: the essay-review path now persists AI output (on the creator-guarded job); the creator-only read guard — not non-persistence — is the leak barrier. (Keep the find-experiences description accurate for THAT path, which still returns live.)
- [ ] **Step 4:** Run → pass; `tsc` clean. Commit: `feat(essay-center): evaluation grounds in the caller's privacy-filtered experiences`

### Task A4: Handlers — stamp identity + creator-only read guard
**Files:** `backend/modules/application-central/handlers.ts`, `handlers.test.ts`
- [ ] **Step 1: Write/adjust failing tests** in `handlers.test.ts`: (a) `startReview` stores `reviewerUsername`/`reviewerRole` from `ctx.requester` (assert on the returned job); (b) **privacy guard** — `reviewStatus` returns the job to its creator, but a DIFFERENT `ctx.requester.username` gets **404** (this is the key privacy test). Use the existing `ctx({requester})` helper with `keira` vs `kate`.
- [ ] **Step 2:** In `startReview` (creates the `essayReviewJobs` job), add to the create payload:
```typescript
        reviewerUsername: ctx.requester.username,
        reviewerRole: ctx.requester.role,
```
In `reviewStatus`, replace the load+notFound with the creator guard:
```typescript
      const job = await getData().essayReviewJobs.get(jobId);
      if (!job || job.reviewerUsername !== ctx.requester.username) throw Errors.notFound('Evaluation job not found');
      return { status: 200, body: job };
```
- [ ] **Step 3: Update the stale comments** at `handlers.ts:4-5` (module header) and the `startReview` comment (~199-202): the full review is persisted on the creator-guarded job; the guard (not non-persistence) prevents a later cross-caller read; `lastReview` is scores-only.
- [ ] **Step 4:** `cd backend && npx tsc --noEmit` (now clean — A1 fields are populated). Run `cd /mnt/c/Keira/keiras-journey && npx vitest run backend/modules/application-central/ --exclude '**/agents/**' && npm run check:routes` → PASS.
- [ ] **Step 5:** Commit (folds A1's type change): `feat(essay-center): stamp reviewer identity + creator-only read of evaluation jobs (privacy)`

### Task A5: Full backend green
- [ ] `cd backend && npx tsc --noEmit && npx vitest run` (root, agents excluded) → PASS. Commit if anything changed.

---

## Chunk B: Frontend — strip workspace + single autosaved body

### Task B1: `EssayWorkspace` trim + autosave
**Files:** `frontend/src/modules/application-central/{EssayWorkspace.tsx,EssayWorkspace.test.tsx}`
- [ ] **Step 1: Update tests** first: EssayWorkspace no longer renders "Find relevant experiences", "Mark final", "Save draft v", "Version history", or the word-target `<input>`; it DOES render the editor, a word count, "Copy essay", "Evaluate", "Try a different question". Editing text and blurring autosaves via `updateEssay(id, { drafts: [{ version:1, content, ... }] })` (mock `updateEssay`, assert called with a single-draft payload). Keep the existing Evaluate-loop and "Try a different question autosave" tests (the latter now asserts `updateEssay`, not `addDraft`).
- [ ] **Step 2: Implement.** In `EssayWorkspace.tsx`:
  - Imports: drop `findExperiences`, `addDraft`; drop `FindResult`, `ESSAY_STATUS_META`, `wordTargetTone` if now unused; keep `updateEssay`, `wordCount`, `VERDICT_META`, `ratingRows`, `ratingTone`.
  - Remove state: `find`, `finding`, `showFinalNudge`, `savingDraft` (replace with `saving`), the editable `target` state → use a const `const target = essay.targetWords ?? DEFAULT_TARGET_WORDS`. Remove `runFind`, `saveTarget`, `setStatus`, `saveDraft` (replace with `saveBody`).
  - **`saveBody`** (single-slot overwrite):
```typescript
  const [saving, setSaving] = useState(false);
  async function saveBody(): Promise<boolean> {
    if (!text.trim()) return true;
    setSaving(true); setError(null);
    try {
      onChanged(await updateEssay(essay.essayId, { drafts: [{ version: 1, content: text, createdAt: new Date().toISOString(), wordCount: wc }] }));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.'); return false;
    } finally { setSaving(false); }
  }
```
  - **Autosave**: debounce on `text` (skip the initial seed) + save on textarea blur:
```typescript
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) return;               // don't save the seeded value
    const t = setTimeout(() => { void saveBody(); }, 800);
    return () => clearTimeout(t);
    // eslint deps: text only; saveBody closes over stable refs
  }, [text]); // add a lint-clean dep strategy (wrap saveBody in useCallback or inline)
  // textarea: onChange={(e)=>{ dirtyRef.current = true; setText(e.target.value); }} onBlur={() => void saveBody()}
```
  (Do NOT add a `react-hooks/exhaustive-deps` disable — that rule isn't configured and the directive is a lint error; use a `useCallback`-wrapped `saveBody` or an inline effect body so deps are honest.)
  - `tryAnother`: change `await saveDraft()` → `await saveBody()`.
  - **Editing view**: remove the "Mark final" buttons (header + nudge), the `showFinalNudge` block, the version-history line, the "Save draft v…" button, and the word-**target** `<input>` (keep the `{wc} / {target} words` badge with the const target). Sidebar: remove "Find relevant experiences" + the "Draw on these" render block. Keep Copy essay, "Try a different question", Evaluate, and the never-writes disclaimer. Header: keep "← Essays"; drop the status badge + Mark final.
  - **Result view**: keep as-is, but its header status `Badge` (`meta`) can be dropped (status lifecycle is gone) — replace with nothing or the word-count badge. The rubric render stays.
  - `copyEssay`: drop the `setShowFinalNudge(true)` line (nudge removed).
- [ ] **Step 3:** `cd frontend && npx tsc --noEmit && cd /mnt/c/Keira/keiras-journey && npx vitest run frontend/src/modules/application-central/EssayWorkspace.test.tsx --exclude '**/agents/**' && npm run lint` → PASS. Commit: `feat(essay-center): slim workspace to editor + count + Copy + Evaluate; single autosaved body`

### Task B2: Attempts list — last score, no status
**Files:** `frontend/src/modules/application-central/{CollegeEssayView.tsx,CollegeEssayView.test.tsx}`
- [ ] The attempts list already shows `lastReview` (per the redesign review at `CollegeEssayView.tsx:236`). Confirm it renders the last score/verdict and does NOT show a status-lifecycle badge (brainstorming/drafting/final). If a status badge is present, remove it; keep the last-score badge. Update/confirm the test. Commit if changed: `feat(essay-center): attempts list shows last score, drops status badge`

### Task B3: Full frontend green
- [ ] `cd frontend && npx tsc --noEmit && cd /mnt/c/Keira/keiras-journey && npx vitest run frontend/src/modules/application-central/ --exclude '**/agents/**' && npm run lint` → PASS.

---

## Chunk C: Ship + verify

- [ ] **C1:** Whole repo green: `cd backend && npx tsc --noEmit && npx vitest run` (root, agents excluded); `cd frontend && npx tsc --noEmit`; root `npm run lint && npm run check:routes` → PASS.
- [ ] **C2:** Controller: PR into `dev` → CI + CodeRabbit → merge (standing auth) → staging deploy.
- [ ] **C3: Staging E2E (privacy-critical):**
  - As **Keira** (or the admin acting as the student caller): write a thin essay → **Evaluate** → confirm the feedback references a REAL logged experience by name (or flags generic-ness), and never rewrites. Confirm "Find relevant experiences" / "Mark final" / versions / target are gone; edits autosave (reopen the attempt → text persists).
  - **Privacy proof:** capture the evaluation `jobId` from the network tab, then as a **different family account (parent)** call `GET /essays/:id/review/:jobId` — MUST return 404 (creator-only). Note: pre-deploy jobs 404 too (fail-closed, expected).

---

## Notes / risks
- **Privacy is the crux** — the A4 creator-guard test (parent → 404) and the A3 pool-by-role test are the highest-value checks. Don't skip them.
- Old jobs lack `reviewerUsername` → `reviewStatus` 404s them (fail-closed, safe).
- Single-draft overwrite loses version *history* by design; current content never lost (editor seeds from `latestDraft`).
- Out of scope: removing the dead `find-experiences` endpoint + client; the essay `status` field stays in the model.
