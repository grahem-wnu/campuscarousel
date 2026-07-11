# Evaluate grounds in real experiences + workspace simplification

**Tier**: 2 (AI-prompt + async-job privacy threading + frontend trim)
**Date**: 2026-07-11
**Status**: Design locked with Grahem (2026-07-11); pending written-spec sign-off
**Builds on**: `2026-07-11-essay-center-redesign.md` (the no-tabs Essay Center + async evaluation).

## Why
Two refinements from Grahem:
1. **Remove "Find relevant experiences"** as a separate button; instead, **Evaluate reads the student's real logged experiences** (privacy-filtered) and calls out where the essay omits or underuses them. The app's premise is grounding essays in real material, so this belongs inside the critique, not a separate step.
2. **Strip the workspace** to editor + word count + Copy + **Evaluate** (repeatable). Drop Mark-final, draft versions / "Save draft vN", and the status lifecycle — an essay is just editable text you evaluate as many times as you like.

## Decisions (Grahem, 2026-07-11)
- Evaluate grounds in the student's logged experiences (privacy-filtered, caller-scoped); the separate "Find relevant experiences" button is removed.
- Workspace keeps: editor, live word count, Copy essay, Evaluate loop, "Try a different question", "← back to colleges". Removes: Mark final, status badges, draft versions + "Save draft vN", editable word target.
- The essay is a **single autosaved body** (no version array UX). The attempts list keeps a light **last-score** badge (informative, not process-tracking); status badges go.

## PRIVACY (get this exactly right)
Evaluate will now read privacy-filtered journal/activity/experience entries. The rule (CLAUDE.md): private entries are available to the AI **only when Keira (student) is the authenticated caller**; a parent/admin sees family-visible only. And AI output that may quote private-derived material must not leak through a later read.

Because evaluation is async, the review **result is persisted** on the `EssayReviewJob` so the frontend can poll it — so persistence + a later read is exactly the leak risk. Two guards:
1. **Filter by the caller who clicked Evaluate.** Store the caller identity on the job at creation (`reviewerUsername`, `reviewerRole` from `ctx.requester`). The worker reconstructs a `Requester = { username, role }` and calls `gatherExperiences(data, requester)` — which runs `aiVisibleSet` off that identity. Keira → her private entries included; a parent → family-visible only (identical to the existing find-experiences privacy model).
2. **Creator-only read of the result.** `GET /essays/:id/review/:jobId` (`reviewStatus`) returns the job **only** to the same caller who created it: `if (job.reviewerUsername !== ctx.requester.username) throw Errors.notFound(...)` (notFound, not forbidden — don't reveal the job exists). This prevents a parent from fetching Keira's private-grounded review. The creator polls their own job immediately, so this is transparent to the happy path.

`gatherSharedExperiences` (family-only, never private) is NOT what we want here — use `gatherExperiences(data, requester)` so Keira gets her full pool. The pool feeds the prompt only; the model is instructed to reference experiences by their (already-clipped, non-sensitive) titles.

## Backend changes
- **`EssayReviewJob`** (`shared/data/types.ts`): add `reviewerUsername: string`, `reviewerRole: 'admin'|'parent'|'student'|'member'` (reuse the `Role` type shape). These carry the caller identity for filtering + the creator-only guard.
- **`startReview` handler** (`handlers.ts`): stamp `reviewerUsername: ctx.requester.username`, `reviewerRole: ctx.requester.role` on the created job.
- **`reviewStatus` handler**: after loading the job, `if (!job || job.reviewerUsername !== ctx.requester.username) throw Errors.notFound('Evaluation job not found')`.
- **`runReviewJob`** (`review.ts`): reconstruct `const requester = { username: job.reviewerUsername, role: job.reviewerRole }`; `const pool = await gatherExperiences(data, requester)`; pass `pool` to the reviewer alongside prompt/content/college. (Import `gatherExperiences` from `./grounding.js`.)
- **`makeBedrockEssayReviewer` + `buildReviewPrompt`** (`ai.ts`): the reviewer input type gains `pool?: ExperiencePool`. When present, the prompt includes the compact experience list (`poolToText(pool)`) and an instruction: *"You also have the student's real logged experiences below. In `improvements`, call out specifically where the essay is generic and name a real logged experience they could draw on, or note if they are underusing strong material. Reference experiences by title; never invent details not in the list."* Keep FEEDBACK-ONLY / never-rewrite. The output shape is unchanged (experience notes fold into `improvements`) — no `EssayReview`/rubric change, so no FE render churn.
- **`EssayReviewer` type**: add `pool?: ExperiencePool` to its input.
- The old sync `findExperiences` handler + `POST /essays/:id/find-experiences` route stay (unused by the FE now) — leave as out-of-scope cleanup, OR remove if trivial. (Recommend leave; low value to remove.)

## Frontend changes (`EssayWorkspace.tsx`)
- **Remove**: the "Find relevant experiences" button + `findExperiences` call + the "Draw on these" render; the "Mark final" button + status badge; the version-history line + "Save draft vN" button; the editable word-**target** input (keep the live count).
- **Keep**: the editor, a live **word count**, **Copy essay**, the **Evaluate → evaluating → result → Back to editing** loop, **Try a different question** (with its autosave gate), **← back to colleges**.
- **Persistence — single autosaved body**: on edit (debounced ~800ms, and on blur / before Evaluate / before "Try a different question"), autosave via `updateEssay(id, { drafts: [{ version: 1, content, createdAt: <iso>, wordCount }] })` — overwrite the single slot; no version growth, no visible "save" button. Reopening an attempt reads `latestDraft(essay).content` as before. (`updateSchema` already accepts `drafts`, so no backend change.)
- **`api.ts`**: `findExperiences` client fn becomes unused (leave; harmless) — or remove its import from EssayWorkspace only.
- **Attempts list** (`CollegeEssayView` attempts view): show the essay + its **last score** (`lastReview.overall`/`verdict`) if present; drop the status badge.

## Testing
- **Backend**: `runReviewJob` passes a privacy-filtered pool to the reviewer (assert the reviewer receives `pool` built from the stored `reviewerRole` — a student job includes private entries, a parent job does not). `reviewStatus` returns the job to its creator and **404s a different caller** (the privacy guard — high value). `buildReviewPrompt` includes experiences + the "name a real logged experience" instruction when `pool` is present, and omits it when absent. Reviewer output shape unchanged (rewrote:false).
- **Frontend**: EssayWorkspace no longer renders Find/Mark-final/version/target; Evaluate loop intact; autosave calls `updateEssay` with a single-draft payload on edit/blur; "Try a different question" still autosaves. Attempts list shows last score, no status badge.
- **Staging E2E**: as Keira, write a thin essay → Evaluate → confirm the feedback references a real logged experience (or notes generic-ness), and the never-rewrite guarantee holds. Confirm a parent account cannot fetch that evaluation job (privacy guard) — prove parent ≠ creator gets 404.

## Out of scope
- Removing the backend `find-experiences` endpoint (leave dead) and its `api.ts` client.
- The essay `status` field stays in the data model (just unused in UI); no migration.
- Prod.
