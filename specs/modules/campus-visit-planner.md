# Module Spec — Campus Visit Planner

## Module id
`campus-visit-planner`

## Purpose
Plan, execute, and document campus visits with nursing-specific prep. Schools notice informed
visitors. Includes trip itineraries for out-of-state clusters.

## Depends on
All foundational specs. Visits attach to colleges (`college-hub` detail tab). Bedrock + web search
(visit prep, open-house dates). Reads `budget` (travel cost).

## Owns (entities)
**Campus Visit** (`COLLEGE#<collegeId>/VISIT#<id>`: date, visitType, attendees[], questionsToAsk[]
{question, answer, askedTo}, impressions, pros[], cons[], photos[], wouldAttend
[yes|no|maybe|undecided], travelCost, createdBy).

## API endpoints
`GET /colleges/:id/visits`, `POST /colleges/:id/visits`, `PUT/DELETE /colleges/:id/visits/:vid`,
`POST /colleges/:id/visits/:vid/prep` (AI: best time, nursing-specific questions, logistics,
contact info), `POST /visits/trip-plan` (AI groups nearby schools into itineraries).

## Frontend
- "Plan Visit" on a college → AI-generated prep: best time (web search for open-house dates),
  pre-populated nursing-specific question checklist (rotation hospitals, ICU placement rate, NCLEX
  pass rate, clinical hours, direct-admit guarantee, support services, ratios, research), custom
  questions, logistics (address, parking, who to contact — from college contact info).
- Trip planner: group nearby schools; AI suggests itineraries ("Iowa + Michigan, spring break");
  estimated travel cost; map of planned visits.
- Post-visit debrief: impressions, pros/cons, answers, would-attend rating, photos; auto-linked to
  the college; "Visited on [date]" badge; comparison after multiple visits. Empty states; mobile + desktop.

## AI behavior
`/prep` + `/trip-plan` → Bedrock + web search (open-house dates, travel grouping). Sync.

## Privacy
Family-visible.

## File-ownership boundary
`backend/modules/campus-visit-planner/**`, `frontend/src/modules/campus-visit-planner/**`, the two
manifests, this spec. Visits are sub-entities under `COLLEGE#`; college-hub renders the tab via manifests.

## Acceptance criteria
- [ ] Visit CRUD (per college) + AI prep + trip-plan + post-visit debrief implemented + tested.
- [ ] Nursing question checklist; visited badge; multi-visit comparison; travel cost; empty states.
- [ ] CI green; reviewer approved.
