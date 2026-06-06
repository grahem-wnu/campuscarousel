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
