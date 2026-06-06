# application-central — checkpoint

## worker-3 @ 2026-06-06 — PR #28 (draft): essay workspace backend in; frontend next

Wave-3 module. Backend committed (8f4b86b). The essay workspace (spec headline) + the canonical
AI-privacy case are done; the tracker/rec/score parts need new data-layer entities (raised below).

### Done (7 endpoints, backend)
GET/POST /essays, GET/PUT/DELETE /essays/:id, POST /essays/:id/find-experiences,
POST /essays/:id/review.
- Essay CRUD + versioned drafts (wordCount/version/createdAt), createdBy from JWT.
- **find-experiences**: reads journal+clinical+why-nursing, narrows with `aiVisibleSet` off the JWT,
  synchronous Bedrock finder selects relevant + angles; persists picks. **PRIVACY TEST passes**
  (handler + router): keira's private entries reach the AI; kate/grahem excluded from candidate set
  AND response.
- **review**: synchronous Bedrock feedback; output allowlist drops any rewritten prose (feedback-only).
- ai.ts mirrors college-hub/scholarship-tracker (BEDROCK_MODEL_ID env, injectable client, graceful
  empty fallback). 33 backend tests green; typecheck/eslint/check:routes clean.

### 🔶 DATA-MODEL GAP (supervisor) — tracker / rec board / score tracker need new entities
The data layer is frozen and has only the **Essay** entity. The spec's other surfaces need NEW
data-layer keys/entities (the spec itself: "model as APPLICATION#... or dedicated keys — define in
data-layer if a new key is needed; raise to supervisor"):
- **Application** (per-college status: deadline, essay/rec/transcript/scores/financial-aid status,
  decision) — for the application tracker + decision matrix.
- **Recommendation** (4 slots: STEM/humanities teacher, clinical/volunteer supervisor, community
  leader; assigned contact, relationship strength, ask timeline, status asked→agreed→received→
  submitted) — for the rec strategy board. Recommenders reference demonstrated-interest-contacts.
- **TestScore** (SAT/ACT/AP; which schools received which scores) — TEAS already has its own entity.

Please add these to backend/shared/data (types + repos) — happy to follow up with the
tracker/rec/score endpoints + UI once they land (same pattern as Bedrock/SQS escalations). This PR
delivers the essay workspace + the privacy acceptance criterion, which stand on their own.

### Boundaries
All under backend/modules/application-central/** (+ frontend/src/modules/application-central/** to
come) + the two manifests. No shared/foundational file touched. No hardcoded config; identity off JWT.

---

## worker-3 @ 2026-06-06T22:32:46Z — PR #28 READY for review (frontend in; essay workspace complete)

Frontend landed (023b6f0): EssaysPage (list/filter/create/empty), EssayWorkspace (prompt, versioned-
draft editor + word-count-vs-target, AI sidebar: Find experiences + suggested angles + Check-my-essay
feedback w/ no rewrite, version history), EssayForm. Pure logic unit-tested.
- 41 module tests green; typecheck (backend+frontend)/eslint/check:routes + Lambda bundle clean.
- PR #28 non-draft, CodeRabbit pass, CI running. All under owned trees + the two manifests; no
  shared/foundational file touched.

Reviewer: ready for a full pass — the essay workspace + the PRIVACY test (keira's private entries
reach the essay AI; kate/grahem excluded, handler + router) are the core deliverable.

STILL OPEN (data-model, supervisor): application tracker / recommendation board / SAT-ACT-AP score
tracker need new data-layer entities (Application, Recommendation, TestScore) — only Essay exists.
Will follow up with those endpoints + UI once the entities land. Not blocking the essay workspace.
