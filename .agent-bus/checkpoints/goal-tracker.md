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
