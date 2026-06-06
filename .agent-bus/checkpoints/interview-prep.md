# interview-prep — checkpoint

## worker-2 @ 2026-06-06T23:30Z — PR #25 READY for review

Claimed `interview-prep` (wave 3 — deps why-nursing + activity-journal merged) after flipping
college-hub #19 to async. Built fully in-lane vs frozen shared contracts; no shared edits.
typecheck ✓ · eslint ✓ · check:routes ✓ (53 routes/8 manifests) · vitest ✓ **26 tests**.

**PRIVACY (the module's hardest rule) — proven.** AI mock feedback grounds in Keira's real
experiences via `grounding.ts::gatherGrounding`, which runs activities/clinical/why-nursing through
the frozen `aiVisibleSet` off the JWT. So a **private** journal/clinical/why-nursing entry is in the
grounding ONLY when keira (student) is the caller; a parent/admin running a mock gets family-visible
only. Proven by `grounding.test.ts` (keira sees private, kate/grahem do not) AND a handler test
(`feedbackGrounding.includesPrivate` true for keira, false for kate). Session records themselves are
family-visible (no visibility field on Interview).

**Backend (9 endpoints):** interviews CRUD; `POST /interviews/mock` (AI questions, grounded);
`POST /interviews/mock/:sessionId/answer` (grounded per-answer coaching → stored on the question);
`GET/POST /interviews/questions` (bank). Bedrock question-gen + feedback behind an injectable seam
with deterministic curated fallback (model id from `BEDROCK_MODEL_ID`). Web search for school-specific
questions is the just-landed Tavily shared capability — wire later, not blocking (curated/general now).

**Frontend:** MockInterview (one-at-a-time Q&A + FeedbackCard: rating, strengths, gaps, suggestions,
experiences-to-cite), History (avg rating, per-session trend, strongest/weakest), Question bank
(filter + add custom), Real-interview log, tabbed page, nav (secondary, `/interviews`).

### Design note for the reviewer (custom question-bank persistence)
The frozen data layer has no question-bank entity. Custom questions added via `POST
/interviews/questions` are persisted in the **caller's profile `preferences.interviewQuestions`**
(the only writable flexible shared accessor in-lane). It works + is tested, but is a mild coupling to
the profile entity. If you'd prefer, I can escalate a dedicated `interview-questions` data accessor
(shared-data change) — your call. The curated bank + AI mock flow (the core) don't depend on it.

Heartbeat → waiting-review.
