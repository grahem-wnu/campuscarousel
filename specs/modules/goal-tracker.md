# Module Spec — Goal Tracker

## Module id
`goal-tracker`

## Purpose
Define, track, and achieve goals mapped to the 4-year plan. No pre-loaded goals; AI suggests
year-by-year goals based on grade level, career goal, current activities, and target colleges.

## Depends on
All foundational specs. Reads `activity-journal` (linked activities), `student-profile`,
`college-hub` (for suggestions). Bedrock (no web search needed for suggestions).

## Owns (entities)
**Goal** (`GOAL#<id>/DETAILS`): title, description, category, targetDate, period, status,
progress (0-100), milestones[], linkedActivities[], createdBy, timestamps.

## API endpoints
`GET /goals` (filter period/status/category); `GET /goals/:id`; `POST /goals`; `PUT /goals/:id`
(milestones, progress); `DELETE /goals/:id`; `POST /goals/suggest` (AI generates suggestions from
profile/grade/career/activities — returns suggestions, not auto-saved).

## Frontend
- Suggest-goals flow: AI returns a checklist; user accepts/modifies/deletes before saving; custom
  goals addable anytime.
- Goal detail: progress bar (manual or auto from linked activities), linked activities, milestone
  checkboxes, notes.
- Board view: kanban (Not Started / In Progress / Completed) or timeline by school year.
- Empty state; mobile + desktop.

## AI behavior
`POST /goals/suggest` → Bedrock (general knowledge, no web search) → year-by-year goal list
shaped to the student's grade/career. Synchronous (fast).

## Privacy
Family-visible. No private-bearing fields.

## File-ownership boundary
`backend/modules/goal-tracker/**`, `frontend/src/modules/goal-tracker/**`, the two manifests, this spec.

## Acceptance criteria
- [ ] CRUD + milestones + progress (manual + auto-from-linked-activities) implemented + tested.
- [ ] AI suggestions returned as editable checklist; nothing auto-saved.
- [ ] Kanban + detail views, empty state, mobile + desktop; CI green; reviewer approved.
