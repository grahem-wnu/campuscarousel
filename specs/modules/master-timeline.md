# Module Spec — Master Timeline

## Module id
`master-timeline`

## Purpose
One unified calendar across every module — deadlines, goals, activities, visits, test dates,
application milestones, scholarship deadlines, certification expirations — in a single view.

## Depends on
All foundational specs. Read-only aggregation across `college-hub`, `goal-tracker`,
`activity-journal`, `campus-visit-planner`, `teas-prep`, `application-central`,
`scholarship-tracker`, `certifications`. Build in the integration wave. Bedrock (prioritization).

## Owns (entities)
None of its own — aggregates dated items from other modules via the shared data-access lib.

## API endpoints
`GET /timeline` (unified events; filters dateRange, module/source, type); `GET /timeline/upcoming`
(next 30/60/90 days, prioritized); `POST /timeline/analyze` (AI priorities, conflicts, missing items).

## Frontend
- Calendar view: month/quarter/year; color-coded by source (activities blue, goals green, app
  deadlines red, test dates yellow, visits purple, scholarship deadlines orange, cert expirations
  pink); click an item → jump to its module detail.
- Timeline view: horizontal freshman→senior arc; major milestones as markers; "You are here";
  zoomable month↔4-year.
- Upcoming view: next 30/60/90 days; overdue first; grouped this week / next week / this month /
  later; quick actions (complete, snooze, open).
- AI integration: "What should I focus on this month?", "Any conflicts?", "What am I forgetting?".
- Empty state; mobile + desktop.

## AI behavior
`/timeline/analyze` → Bedrock reviews aggregated timeline for priorities, conflicts (overlapping
deadlines, double-booked weekends), and missing items vs the 4-year plan. Sync.

## Privacy
Activity-derived events go through the visibility middleware; parents never see events sourced from
keira's private entries.

## File-ownership boundary
`backend/modules/master-timeline/**`, `frontend/src/modules/master-timeline/**`, the two manifests, this spec.

## Acceptance criteria
- [ ] Aggregation across all dated sources; calendar + timeline + upcoming views; AI analyze; tested.
- [ ] Color coding by source; click-through to module details; visibility-filtered; empty state.
- [ ] Mobile + desktop; CI green; reviewer approved.
