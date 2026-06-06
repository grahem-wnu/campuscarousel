# application-central — checkpoint

## worker-2 @ 2026-06-07T00:40Z — PR #28 READY for review

Built the senior-year command center's killer feature in-lane vs frozen contracts.
typecheck ✓ · eslint ✓ · check:routes ✓ (79 routes/11 manifests) · vitest ✓ **28 tests**.

**PRIVACY (the canonical essay case) — proven.** `POST /essays/:id/find-experiences` grounds in
activities/clinical/why-nursing via `gatherExperiences` → `aiVisibleSet` off the JWT, so a PRIVATE
entry is surfaced ONLY when keira is the caller (a parent gets family-visible only). AI output is
returned **live, never persisted**, so there's no read-path leak (the issue you caught in #25).
Proven by grounding.test (keira sees private, kate/grahem don't) + a handler privacy test.

**Backend (9 endpoints):** essay CRUD; `POST /essays/:id/draft` (version + wordCount computed,
status advances); `find-experiences` (AI, privacy); `POST /essays/:id/review` (AI feedback —
`EssayReview.rewrote === false`, **never rewrites**, tested); `GET /applications/overview` (DERIVED
per-college deadline countdown + essay progress + TEAS presence from colleges+essays+teas — no new
storage). Bedrock behind an injectable seam + curated fallback (model id from BEDROCK_MODEL_ID).

**Frontend:** application tracker table; essay workspace (editor, live word-count vs target, version
history, AI sidebar: find-experiences + check-my-essay-feedback-only); essay list; nav (primary
`/applications`).

### Escalation — mutable trackers need a shared entity
The spec's mutable trackers (per-application status checkboxes, the recommendation strategy board's
4 slots, SAT/ACT/AP score tracking) need an `APPLICATION#` entity/keys the frozen data layer lacks
(spec L18-19 says raise to supervisor). I shipped the **application overview as a derived read-only
view** (no new storage); the mutable trackers + rec board + non-TEAS score tracking are escalated.
If you want them, the cleanest is a shared `applications` accessor (PK `APPLICATION#<collegeId>`) —
I'll wire the module side once it lands (Bedrock/SQS precedent).

Heartbeat → waiting-review.

---

## spec-reviewer @ 2026-06-06T22:47Z — PR #28 (head 38d1660) — 🔴 CHANGES REQUESTED

Reviewed `feat/application-central` (+1571/-0, 20 files) vs `specs/modules/application-central.md`.
Privacy is correct (verified myself) and the shipped scope is solid — but a nav conformance fix + a
spec-acceptance gap (blocked on a foundational entity) keep it from spec-complete.

- **PRIVACY ✓ (verified — the essay workspace is the key AI/private surface):** AI context built via
  `aiVisibleSet(..., requester)` off the JWT for activities/clinical/whyNursing (`grounding.ts`,
  `gatherExperiences(data, ctx.requester)` at handlers.ts:135) — keira-includes / parent-excludes,
  tested. **Crucially (the PR #25 lesson): AI output is returned LIVE, never persisted** —
  findExperiences/review return it in `body` only, never `essays.update`; `updateSchema =
  createSchema.partial()` excludes the AI-suggested fields so a client PUT can't write them either
  (non-persistence test handlers.test.ts:82-84). Essays are family-visible but store only keira's own
  typed draft/prompt/notes — no private-derived content on the record → no leak. (This is why no
  owner-scoping is needed here, unlike interview-prep #25.)
- **Clean:** authz off JWT (401 proven), `createdBy` server-set; no hardcoded model-id/table/account
  (`BEDROCK_MODEL_ID` env, `dataFromEnv()`); Bedrock server-side + curated fallback + FEEDBACK-ONLY
  (rewrote:false) enforced; three-dot boundary strictly in module trees; no cross-module imports
  (reads colleges/scholarships/activities/clinical/whyNursing via shared accessors); single-table.

### Required — worker-actionable (in your lane)
1. **[Conformance] `frontend/src/modules/application-central/nav.manifest.ts:10` — `group: 'primary'`**
   registers a 6th primary tab (and collides at `order:40` with scholarship-tracker). design-system.md
   fixes the 5 primary tabs (Dashboard/Journal/Colleges/Scholarships/Timeline). Fix: `group: 'secondary'`.

### Blocked on foundational entity (ESCALATED — not your fault)
2. **[Completeness — acceptance] Recommendation-strategy board, test-score tracker (CRUD), and decision
   matrix are not implemented** (spec §Frontend/§Acceptance require all three). Only essay CRUD/drafts +
   AI find/review + a derived read-only overview shipped. These need a dedicated mutable `APPLICATION#`
   entity/accessor on the **frozen data layer** (out of the module's lane) — you correctly escalated
   this (overview.ts:1-5). ESCALATED to supervisor: add the `APPLICATION#` entity (+ per-college
   test-score routing, not the current single `hasTeasScore` boolean), then wire rec-board/score/matrix.
   Grahem/supervisor: decide staged-merge (ship the essay core now, features follow) vs hold.

Non-blocking: slow fallback test (ai.test awaits the real SDK import before the injected throw — optional).

**Verdict: CHANGES REQUESTED** — fix nav (item 1) now; item 2 is a foundational escalation + Grahem
staged-merge decision. Privacy/boundary/authz/Bedrock all verified clean. ⚠️ Self-PR under `grahem-wnu`
→ checkpoint + PR comment are the signal.
