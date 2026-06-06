# Module Spec — TEAS Prep Center

## Module id
`teas-prep`

## Purpose
Track TEAS exam prep: practice scores (overall + per section), progression charts, AI study plans,
study-session logging, official exam tracking. The TEAS is the biggest BSN admissions gate.

## Depends on
All foundational specs. Reads `college-hub` (target TEAS requirements). Bedrock (study plan/analysis).

## Owns (entities)
**TEAS Prep Record** (`TEAS#<id>/DETAILS`: type [practice-test|study-session|official-exam], date,
overallScore, sectionScores {reading, math, science, englishLanguageUsage}, source, studyTopics[],
studyDuration, weakAreas[], strongAreas[], notes; GSI4 by date).

## API endpoints
`GET /teas`; `GET /teas/:id`; `POST /teas`; `PUT /teas/:id`; `DELETE /teas/:id`;
`GET /teas/progress` (progression for charting); `POST /teas/study-plan` (AI plan from scores,
weak areas, target schools, exam date); `POST /teas/analyze` (AI trend analysis + recommendations).

## Frontend
- Score tracker: log practice scores; line chart of progression; per-section breakdown with color
  coding (green strong / yellow needs-work / red critical); target line per college.
- Study plan: AI-generated weekly topic focus + hours + practice schedule; progress vs plan.
- Study-session log: date, topics, duration, notes; cumulative hours.
- AI coaching buttons: "Analyze my scores", "What should I study this week?", "Am I ready?".
- Official-exam tracking + score-send tracking + retake comparison. Empty state; mobile + desktop.

## AI behavior
`/teas/study-plan` + `/teas/analyze` → Bedrock (general knowledge; no web search needed). Plans
keyed to weak areas + exam date + target requirements.

## Privacy
Family-visible.

## File-ownership boundary
`backend/modules/teas-prep/**`, `frontend/src/modules/teas-prep/**`, the two manifests, this spec.

## Acceptance criteria
- [ ] CRUD + progression chart + per-section breakdown + AI study plan + analysis implemented + tested.
- [ ] Official exam + score-send + retake comparison; empty state; mobile + desktop.
- [ ] CI green; reviewer approved.
