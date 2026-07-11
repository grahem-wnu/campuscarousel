# Essay Coach — Practice-First Redesign

**Tier**: 2 (frontend rewire of an existing feature + one new backend route)
**Date**: 2026-07-10
**Status**: Design approved conversationally (Grahem, 2026-07-10); pending written-spec sign-off

## Summary

Reframe the **Essays** tab of Application Central from "paste a college prompt, then draft"
into a **practice-first essay coach**: pick a school → the coach offers that school's real (or
generic, clearly disclosed) essay questions → tap **"Write about this one"** → write → get rubric
feedback → edit and re-check → jump back to try a different question. Every practice piece is
saved per college so Keira can accumulate and revisit attempts.

This is a **rewire, not a greenfield build.** Most of the machinery already exists on `dev`:
real hydrated college prompts, a model-only practice-question generator, the rubric review, and
the never-a-rewrite feedback loop. The work is (1) making questions the *front door* instead of a
buried sidebar button, (2) making questions *actionable*, (3) an attempts view, and (4) removing
manual prompt entry.

Framing decision: this is **writing practice**, not the system of record for real essays. Keira
will most likely write the real essay in Word or on the school's portal. The existing "Copy essay"
+ "Mark final" affordances stay, so a strong practice piece can still be carried out to the real
application.

### Decisions (Grahem, 2026-07-10)
- **Scope**: Only the **Essays** experience changes. Applications / Recommenders / Test scores /
  Decisions tabs are untouched. Essays remain **per college**.
- **Questions source**: Real college prompts when available; otherwise generated practice
  questions — with an **explicit disclosure banner** when they are not the school's real questions.
- **Rating**: Keep the existing rubric bars **and** the overall X/10 + verdict badge. (Supersedes
  an earlier "bars only" leaning, now that the grade already ships.)
- **College selection**: College Hub schools first, plus a **type-a-different-school** escape
  hatch, plus a **"general practice / no school"** option.
- **Manual prompt entry**: **Removed.** Every essay is born from a suggested/real question card.
  A typed-in *college* is still allowed; a typed-in *prompt* is not.
- **Attempts**: Auto-saved per college; never silently discarded when she switches questions.
- **Architecture**: Question generation is a single **model-only** Bedrock call (`invokeText`,
  no web search) — safe in the request path, **no async/SQS worker**. Real prompts piggyback on
  the college's already-hydrated `essayPrompts`.
- **Data model**: one **additive, optional** field only (`collegeName` free-text, to label
  typed non-roster schools — see below). No breaking changes; no new entities.

## What already exists (reused as-is)

| Piece | Location |
|-------|----------|
| Model-only practice-question generator (college-aware, curated fallback, prepends up to 2 real prompts) | `backend/modules/application-central/ai.ts` — `makeBedrockPracticeQuestions` / `curatedPracticeQuestions` / `buildPracticePrompt` |
| College context incl. real `essayPrompts` | `ai.ts` via `grounding.ts` `gatherCollegeContext` |
| Rubric review (`ReviewRatings` + overall + verdict, `rewrote: false`) | `ai.ts` reviewer + `EssayWorkspace.tsx` render (bars + /10 + verdict) |
| Real prompts on the roster option | `types.ts` `CollegeOption.essayPrompts`, `api.ts` `listCollegeOptions` |
| Editor: textarea, live word count, target, version history, Copy essay, Mark final, Find experiences | `EssayWorkspace.tsx` |
| Per-college essay listing | `api.ts` `listEssays({ collegeId })` |

## Approach

Assemble the question list **client-side, questions-first**, from two sources the app already has:
real hydrated prompts (`CollegeOption.essayPrompts`) and the generator. Add **one** backend route
so questions can be fetched *before* an essay exists (today the generator is keyed by `essayId`).
"Write about this one" then creates the essay seeded with the chosen question as its `prompt`, and
opens the existing workspace. No new data model, no async infra.

Rejected alternative: create a throwaway "shell" essay first, then call the existing
`/essays/:id/practice-questions`. Cheaper to code but litters the attempts list with empty essays
the moment she peeks at questions — exactly the "never lose / never clutter" property we want.

## Changes

### Backend

| File | Change |
|------|--------|
| `backend/modules/application-central/schema.ts` | Add `collegePracticeSchema` = `{ collegeId?: string, collegeName?: string, count?: number (3–8) }` (strict). Add optional `collegeName?: string (≤200)` to `createSchema`/`EssayInput` so a typed non-roster school's label persists on the attempt (roster essays keep using `collegeId`). |
| `backend/modules/application-central/ai.ts` | `buildPracticePrompt` / `curatedPracticeQuestions` already accept a `college?: CollegeContext`. Allow a **name-only** college (typed non-roster school) so the generator can echo its style without a hydrated record. `CollegeContext` requires `collegeId` + `name`; synthesize with a placeholder `collegeId: ''` (nothing reads it in the generator path). No signature break. |
| `backend/modules/application-central/handlers.ts` | New `practiceQuestionsForCollege` handler: `POST /essays/practice-questions` (no `:id`). Body → if `collegeId`, `gatherCollegeContext(data, collegeId)`; else if `collegeName`, synthesize a name-only `CollegeContext` (`{ collegeId: '', name }`); else no college. Call `practice({ college, majors: await activeMajors(), count })` (`activeMajors` is the in-scope closure inside `makeHandlers`). Return `PracticeQuestionSet & { usedRealPrompts: boolean; collegeName?: string }`, where `usedRealPrompts = (college?.essayPrompts?.length ?? 0) > 0`. |
| `backend/modules/application-central/routes.manifest.ts` | Register `POST /essays/practice-questions`. (Route order is irrelevant — the router matches by method + segment count and sorts by static specificity, so a 2-segment static route cannot be shadowed by the 3-segment `/essays/:id/*`. No ordering requirement.) |
| `backend/modules/application-central/handlers.test.ts` | Tests: collegeId path returns `usedRealPrompts: true` when the college has `essayPrompts`; name-only path returns generated questions with `usedRealPrompts: false`; no-college path returns Common-App-style set; generator failure falls back to curated. |

The existing `POST /essays/:id/practice-questions` route/handler is **removed** — after this change
it has no caller (the workspace's old "Practice questions" button becomes "Try a different
question", which routes to the new collegeId flow). Its frontend counterparts are deleted too
(see the `EssayWorkspace.tsx` row).

### Frontend

| File | Change |
|------|--------|
| `frontend/src/modules/application-central/types.ts` | Add `usedRealPrompts?: boolean` to `PracticeQuestionSet`. Add `collegeName?: string` to `Essay` and `EssayInput`. |
| `frontend/src/modules/application-central/api.ts` | Add `getPracticeQuestionsForCollege({ collegeId?, collegeName?, count? })` → `POST /essays/practice-questions`. **Remove** `getPracticeQuestions(essayId, …)` (its `/essays/:id/practice-questions` route is gone). |
| `frontend/src/modules/application-central/EssayCoachStart.tsx` (new) | The questions-first front door. **Step 1 — school picker**: Hub colleges (from `listCollegeOptions`), a "different school" free-text input, and a "General practice (no school)" option. **Step 2 — question list**: fetch via `getPracticeQuestionsForCollege` (pass `collegeId` for a roster school, `collegeName` for a typed one); render each `PracticeQuestion` (question / why / tip) as a card with a **"Write about this one"** button; show a disclosure banner when `!usedRealPrompts`: *"I couldn't find {School}'s current essay questions, so these are general practice prompts of the kind admissions essays ask."* "Write about this one" calls `createEssay({ collegeId?, collegeName?, prompt: question, promptSource: usedRealPrompts ? 'college' : 'practice' })` (roster school → `collegeId`; typed school → `collegeName`) then opens the workspace. |
| `frontend/src/modules/application-central/ApplicationCentralPage.tsx` | **Remove** the "Start a new essay" `Modal` (college select + prompt textarea + Create) and the `prompt`/`showNew`/`create` state. Essays tab now renders: **empty state** → an Essay-Coach intro card + **"Start practicing"** (opens `EssayCoachStart`); **populated** → "Your attempts" grouped by school + a **"Practice a new essay"** button (opens `EssayCoachStart`). `ApplicationOverview.onStartEssay(cid)` opens `EssayCoachStart` pre-seeded to that college instead of the old modal. School label resolves `collegeId` via the roster, falling back to the essay's `collegeName`. |
| `frontend/src/modules/application-central/EssayWorkspace.tsx` | Keep the Prompt card (now always populated with the chosen question) and the rubric + /10 + verdict render (unchanged per decision). **Delete the dead in-workspace practice-questions code** (`getPracticeQuestions` call, `practice`/`practicing` state, and its render block). Replace the sidebar **"Practice questions"** button with **"Try a different question"** → auto-saves the current draft, then returns to `EssayCoachStart`'s question list for this school (starting a *new* attempt). Keep "Find relevant experiences", Copy essay, Mark final, Check & rate. |
| `frontend/src/modules/application-central/logic.ts` | Add `groupEssaysByCollege(essays, collegeLabel)` for the attempts view, where `collegeLabel(essay)` = roster name by `collegeId` ?? `essay.collegeName` ?? "General practice". |

### Attempts & "never lose work"

- Essays already persist per college; the attempts view is a **grouping** of `listEssays()` by
  `collegeId` (uncategorized "General practice" group for essays with no college).
- Switching questions ("Try a different question" / "← Back to questions") **auto-saves the
  current draft** (`addDraft`) if it has unsaved text before navigating, so nothing is lost.
- Each attempt reopens straight into the workspace with its question and version history intact.

## API Contract

### `POST /essays/practice-questions` (authorized)
**Request** (strict): `{ collegeId?: string, collegeName?: string, count?: number (3–8, default 5) }`
**Response**: `200 { questions: PracticeQuestion[], source: 'ai' | 'curated', collegeName?: string, usedRealPrompts: boolean }`
- `usedRealPrompts` is `true` only when a roster college with real `essayPrompts` grounded the set.
- Registration order is irrelevant: the router matches by method + segment count and sorts by
  static specificity, so this 2-segment static route cannot be shadowed by `/essays/:id/*`.

`PracticeQuestion = { question: string, why: string, tip: string }` (unchanged).

## UX Flow

1. **Essays tab, first time** → Essay-Coach intro card ("Practice writing real admissions essays.
   Pick a school, I'll pull up the kinds of questions it asks, you write, I coach — I never write
   it for you.") + **"Start practicing."**
2. **Pick a school** → Hub school, a typed school, or general practice.
3. **Questions** → real prompts if found, else generated + disclosure banner. Each has
   **"Write about this one."**
4. **Write** → workspace: question at top, serif editor, live word count, autosave, coach sidebar
   (Find experiences / Try a different question / Check & rate). **"← Back to questions"** always
   available; current draft auto-saved.
5. **Coach my essay** → rubric bars + overall /10 + verdict + strengths/improvements/authenticity,
   never a rewrite. Edit and re-run; bars move.
6. **Your attempts** (populated state) → per-college list; reopen any, or practice a new one.

## Testing

- **Backend unit** (`handlers.test.ts`): the four `practiceQuestionsForCollege` cases above; route
  ordering (`/essays/practice-questions` not shadowed by `:id`).
- **Backend unit** (`ai.test.ts`): name-only college produces school-styled questions; curated
  fallback on model failure; `usedRealPrompts` reflects `essayPrompts` presence.
- **Frontend** (`EssayCoachStart.test.tsx`, jsdom): picker → question fetch → disclosure banner
  shows iff `usedRealPrompts === false`; "Write about this one" calls `createEssay` with the right
  `prompt`/`promptSource` and transitions to the workspace.
- **Frontend** (`ApplicationCentralPage.test.tsx`): empty state shows the intro + "Start
  practicing"; populated state groups attempts by college; the old prompt modal is gone.
- **Manual/QA**: full loop against staging for a Hub college *with* real prompts and one *without*
  (disclosure), plus a typed non-roster school and general practice. Verify auto-save on
  "Try a different question" (no lost text). Confirm the never-a-rewrite guarantee holds.

## Out of scope
- No changes to Applications / Recommenders / Test scores / Decisions tabs.
- No async/SQS work; no college-hydration changes (real prompts come from existing hydration).
- No billing or auth changes. The only data-model change is the single additive optional
  `collegeName` field on the essay (for typed non-roster schools).
