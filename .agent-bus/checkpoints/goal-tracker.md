# goal-tracker — checkpoint

## worker-3 @ 2026-06-06T17:01Z — PR #15 ready for review

Wave-2 module. CRUD + milestones + progress + AI suggest flow + board/timeline UI.
**Goals are family-visible (no `private` state)** per the spec, so there is no visibility
middleware and the privacy test does not apply to this module.

### Status
- All endpoints, frontend, and tests complete. 51 tests green (43 backend + 8 frontend).
  `tsc --noEmit` (backend + frontend), `eslint`, and `check:routes` all clean.
- Self-reviewed; one milestone-date re-stamp bug found and fixed before marking ready.
- Draft → ready. Supervisor merges; I do not.

### 🔶 SHARED-FILE NEED (raised, not edited from my lane) — `POST /goals/suggest`
The Lambda bundle (`backend/scripts/build-lambda.mjs`) esbuild-inlines **all** imports with no
externals, so a real Bedrock call requires **`@aws-sdk/client-bedrock-runtime` in
`backend/package.json`** — a foundational file a module may not edit (file-ownership rule).

**Request to supervisor:** add `@aws-sdk/client-bedrock-runtime` to `backend/package.json`
dependencies, and ideally introduce a shared `backend/shared/ai` Bedrock helper. This is the
**same need worker-2 raised for `certifications`** — why-nursing, interview-prep, and ai-assistant
will all need it too, so it's worth doing once as a shared contract.

Until then `/goals/suggest` is fully built behind dependency injection:
- `suggester.ts` — `GoalSuggester` interface, a pure `buildSuggestPrompt`, a pure `parseSuggestions`
  (both unit-tested), and `unavailableSuggester` which returns a clean **503** (no uninstalled
  import, so the bundle stays clean and CI green).
- Once the dep lands, the only change is a real Bedrock-backed `GoalSuggester` in `routes.manifest.ts`
  (a few lines) — the prompt/parse pipeline and the whole frontend suggest flow already work.

### Notes / interpretations for the spec-reviewer
- **Progress** ("manual or auto from linked activities"): milestones are the only completable
  units, so a goal with milestones shows milestone-completion progress ("auto"); otherwise the
  manual `progress` value. The frozen `Goal` type has no progress-mode field, so this is derived
  (pure helper, tested), not stored.
- **linkedActivities**: accepted by the schema + shown in the detail view, but no in-form picker
  (cross-module dep on activity-journal); populatable via the API.
- I deliberately did **not** commit the regenerated `backend/lambda/generated/manifests.ts`
  (foundational + a cross-worker merge-conflict magnet); the deploy `build:lambda` step regenerates
  the barrel from the merged tree (the backend-bundle contract's route-registration mechanism).

### Boundaries
All under `backend/modules/goal-tracker/**` + `frontend/src/modules/goal-tracker/**` (incl. the two
append-only manifests). No shared/foundational file touched. No hardcoded config; identity off the JWT.

---

## spec-reviewer @ 2026-06-06T17:18Z — PR #15 (head b0cfdde) — 🔴 CHANGES REQUESTED

Reviewed `feat/goal-tracker` (+2086/-0, 21 files) against `specs/modules/goal-tracker.md`.
Clean, conformant, well-tested — but a spec acceptance item is unmet (progress source), a nav
placement diverges from the design-system contract, and the AI flow is 503-stubbed.

**No hard fails:** boundary clean (verified, only module trees); no shared-contract edits; no
secrets/hardcoded model-id/table/account (`dataFromEnv()`); authz off the JWT (`createdBy` set
server-side from `ctx.requester`, client `createdBy` → 422; 401 path proven). Family-visible →
no private path required (correct). Single-table modeling correct (PK=GOAL#<id>, SK=DETAILS, milestones
embedded). CI green; 51 tests pass.

### Required — worker-actionable (in your lane)

1. **[Conformance] `nav.manifest.ts:11` — Goals registered as `group: 'primary'`.** The
   design-system spec fixes the 5 primary tabs (Dashboard/Journal/Colleges/Scholarships/Timeline)
   and the master spec places Goals in **secondary** nav. Fix: `group: 'secondary'` (a primary entry
   overflows the 5-tab mobile bottom bar).
2. **[Correctness/Completeness — acceptance L42] Progress is not derived/persisted server-side.**
   `clampProgress` + `progressFromMilestones` (`progress.ts:17,24`) are exported and tested but
   **never imported by `handlers.ts`** — auto-progress is computed only on the frontend
   (`logic.ts:47`). So the persisted `Goal.progress` is whatever the client last sent, and a
   non-UI consumer (e.g. the dashboard goal-progress widget reading `goal.progress`) sees a stale
   value — contra CLAUDE.md "server is the source of truth." Fix: in `create`/`update`, after
   `normaliseMilestones`, set `progress = progressFromMilestones(milestones) ?? input.progress`
   (makes the two orphaned helpers load-bearing) + a handler test.

### For Grahem / supervisor (product / foundational decisions)

3. **[Spec deviation — acceptance L42 "auto from linked-activities"] Progress auto-derives from
   MILESTONES, not linked activities.** Defensible (milestones are the completable units; the frozen
   `Goal` type has no progress-mode field) and documented in this checkpoint, but it diverges from
   the spec wording. Per CLAUDE.md, behavior changes start in the spec — confirm with Grahem; if
   accepted, update `goal-tracker.md` so code and spec agree. (`linkedActivities` is stored + shown
   but has no in-form picker — cross-module dep on activity-journal.)
4. **[Completeness — acceptance L43] AI suggestions return a clean 503** because the shared Bedrock
   client / SDK dep is missing (same cross-cutting gap worker-2 raised; you raised it too — both
   correctly refused to edit the frozen bundle). The prompt/parse pipeline + the editable-checklist
   UI are built + tested; only the live call is gated. Escalated to the supervisor (see
   spec-reviewer.json `needs`). Wire `GoalSuggester` (model id from env/SSM) once the shared client
   lands. **Staged-delivery decision is Grahem's:** the supervisor may merge after items 1-2 if
   Grahem accepts staged AI, tracking item 4 as a follow-up; else hold for the shared client.

**Verdict: CHANGES REQUESTED** (items 1-2 now; items 3-4 pending Grahem/shared-client). ⚠️ Formal
`--request-changes` impossible (self-PR under `grahem-wnu`); posted as a PR **comment** — this
checkpoint + comment are the signal.

## infra @ 2026-06-06T17:35Z — Bedrock dep PROVIDED (PR #17)
`@aws-sdk/client-bedrock-runtime` added to `backend/package.json` (PR #17, awaiting supervisor merge).
The Lambda role already has `bedrock:InvokeModel` + `BEDROCK_MODEL_ID`. Once #17 merges, drop a real
Bedrock-backed suggester into `routes.manifest.ts` behind your existing seam — no handler/test changes.

---

## worker-3 @ 2026-06-06T17:31:29Z — round 1 addressed (head c393aa5)

Items 1-2 (worker-actionable) fixed:
- **#1 nav group** → `secondary` (design-system.md:18-20 fixes the 5 primary tabs; Goals is "the rest").
- **#2 server-authoritative progress**: `create`/`update` now set
  `progress = progressFromMilestones(milestones) ?? manual` — `Goal.progress` is derived+persisted
  server-side, so non-UI consumers (dashboard widget) read a correct value. The orphaned `progress.ts`
  helpers are now load-bearing. +4 handler tests. **54 tests green**; tsc/eslint/check:routes clean.

Items 3-4 left for Grahem/supervisor (as you scoped them):
- **#3** progress derives from milestones (only completable unit; frozen `Goal` has no mode field).
  If the spec wording must hold literally, that's a spec edit first per CLAUDE.md.
- **#4** `/goals/suggest` 503 until the shared Bedrock client/SDK dep lands (cross-cutting; worker-2
  + worker-3 both raised it, both refused to edit the frozen bundle). Pipeline+UI built & tested.

Reviewer: re-review at c393aa5 when you can. Supervisor: if Grahem accepts staged AI + the
milestone-progress interpretation, this is mergeable after re-review; else hold #4 for the shared client.

---

## spec-reviewer @ 2026-06-06T17:42Z — PR #15 round 2 (head c393aa5) — 🟡 CHANGES REQUESTED (narrowed)

Re-reviewed delta `b0cfdde..c393aa5` (three-dot boundary clean — only goal-tracker trees). CI green.

**Both worker-actionable items: FIXED — verified. Nice work.**
1. **Nav group ✓** — `group: 'secondary'` with a clear comment. Matches the design-system 5-primary-tab
   contract.
2. **Server-authoritative progress ✓** — `create` and `update` derive `progress` from milestones
   (`progressFromMilestones(...) ?? manual`); update correctly uses `existing.milestones` when the
   patch omits them, so toggling a milestone recomputes and a non-UI consumer reads a correct value.
   The previously-orphaned helpers are now load-bearing. Tests added cover: derive-overrides-sent on
   create, milestone-wins-over-manual + re-stamp on update, manual honored when no milestones.

### Remaining items

4. **[Completeness — acceptance L43] Wire the real Bedrock suggester — the blocker has LIFTED.**
   Your note (and the infra note above) treat this as "503 until the dep lands." **It landed:**
   `@aws-sdk/client-bedrock-runtime ^3.700.0` is now on `dev`'s `backend/package.json`. You do NOT
   need a shared `backend/shared/ai` helper — import the SDK **directly in your module**
   (`suggester.ts` / `routes.manifest.ts`), build `BedrockRuntimeClient` + `InvokeModelCommand`,
   take the model/inference-profile from the **`BEDROCK_MODEL_ID` env var** (already on the Lambda
   role — do NOT hardcode), reuse your existing pure `buildSuggestPrompt`/`parseSuggestions`, and
   fall back to a clean error on failure. Add a Bedrock-failure test. Your seam makes this the few
   lines you described. (Grahem/supervisor staged-delivery override applies, same as #14: if Grahem
   accepts shipping with the 503 now and wiring AI as a fast follow-up, supervisor may merge — say so
   here if you'd rather wait for that ruling than wire it.)

3. **[Spec deviation — acceptance L42 "auto from linked-activities"] Still for Grahem.** Progress
   derives from milestones, not linked activities. Reasonable + documented, but diverges from spec
   wording — per CLAUDE.md a behavior change starts in the spec. Grahem to confirm; if accepted,
   update `goal-tracker.md` to match. (Not a worker hard-block; carried for the product owner.)

**Verdict: CHANGES REQUESTED**, narrowed to item 4 (now unblocked + in-lane); items 1-2 cleared;
item 3 is Grahem's. Not auto-mergeable as spec-complete until Bedrock is wired OR Grahem signs off on
staged delivery + the milestone-progress interpretation. ⚠️ Formal review impossible (self-PR under
`grahem-wnu`); posted as a PR **comment**.
