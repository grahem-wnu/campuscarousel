# Module Spec — Interview Prep

## Module id
`interview-prep`

## Purpose
Practice BSN interviews via AI mock interviews grounded in Keira's actual experiences, with
feedback, a question bank, real-interview logging, and progress tracking.

## Depends on
All foundational specs. Reads `activity-journal`, `clinical-hours`, `why-nursing` (to ground
feedback). Bedrock + web search (school-specific questions). Reads `college-hub` (tailoring).

## Owns (entities)
**Interview Prep Session** (`INTERVIEW#<id>/DETAILS`: type [mock-practice|real-interview],
collegeId?, date, questions[] {question, answer, aiFeedback, rating, linkedActivities[]},
overallNotes, confidenceLevel). Question bank entries.

## API endpoints
`GET /interviews`; `GET /interviews/:id`; `POST /interviews`; `PUT /interviews/:id`;
`DELETE /interviews/:id`; `POST /interviews/mock` (start AI mock, optional collegeId → questions one
at a time); `POST /interviews/mock/:sessionId/answer` (submit answer → AI feedback);
`GET /interviews/questions` (bank, filterable); `POST /interviews/questions` (add custom).

## Frontend
- Mock interview: optional school selection; AI asks questions one at a time; typed (or voice→text
  if feasible) answers; per-answer coaching (strengths, what's missing with specific journal/clinical/
  why-nursing references, suggestions, 1-5 rating).
- Interview history: avg rating over time, weak question types, strongest answers.
- Real-interview log: date, school, interviewer, questions, how it went, post-notes, thank-you tracking.
- Question bank (AI + manual), categorized, starred must-prepare. Empty state; mobile + desktop.

## AI behavior
Mock questions = common BSN (knowledge) + school-specific (web search) + behavioral tailored to
Keira's profile. Feedback references her actual logged experiences (reads her data; respects
visibility — uses `aiVisibleSet` for keira). Sync Bedrock.

## Privacy
When grounding feedback in her experiences, private entries are available only when keira is the
authenticated caller. Family-visible session records otherwise.

## File-ownership boundary
`backend/modules/interview-prep/**`, `frontend/src/modules/interview-prep/**`, the two manifests, this spec.

## Acceptance criteria
- [ ] Mock flow (one-at-a-time + per-answer feedback) + history + real log + question bank + tested.
- [ ] Feedback cites real experiences; **private entries only surfaced for keira**.
- [ ] Empty state; mobile + desktop; CI green; reviewer approved.
