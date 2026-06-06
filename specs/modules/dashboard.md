# Module Spec — Dashboard

## Module id
`dashboard`

## Purpose
At-a-glance view of the whole journey, with role-specific emphasis. Aggregates data from many
modules; ships after the modules it reads (high `dependsOn`).

## Depends on
All foundational specs; reads from `activity-journal`, `college-hub`, `goal-tracker`,
`course-planner`, `scholarship-tracker`, `teas-prep`, `clinical-hours`, `certifications`,
`peer-benchmark`, `master-timeline`. Build in the integration wave.

## Owns (entities)
None of its own. Read-only aggregation via the shared data-access lib.

## API endpoints
- `GET /dashboard` — aggregated payload for the authenticated user: GPA, activity summary,
  clinical-hours total, latest TEAS, certification status (active/expiring), upcoming deadlines
  (colleges + goals + scholarships + certifications + timeline), college status counts, goal
  progress, budget overview with scholarship impact, benchmark readiness, recent activity feed.
  All visibility-filtered for the requester.

## Frontend
- **All users:** GPA, activity hours by category + streak, clinical-hours total (prominent),
  upcoming deadlines, recent activity feed (family-visible unless keira viewing), college status
  counts, TEAS status, certifications status, quick-add.
- **Grahem/Kate:** budget overview (budget + awarded scholarships vs target-school costs), goal
  on-track/behind, scholarship pipeline, benchmark readiness summary.
- **Keira:** streak tracker, next milestone, a motivational stat, "Why Nursing" capture prompt,
  interview readiness score.
- Dense layout (per design notes). Mobile + desktop.

## AI behavior
None directly (the motivational stat is computed, not generated).

## Privacy
Recent-activity feed and any private-bearing aggregates go through the visibility middleware;
parents never see keira's private entries in any widget.

## File-ownership boundary
`backend/modules/dashboard/**`, `frontend/src/modules/dashboard/**`, the two manifests, this spec.

## Acceptance criteria
- [ ] `GET /dashboard` returns the full role-appropriate payload, visibility-filtered, tested.
- [ ] Role-specific widget sets render correctly for admin/parent/student.
- [ ] Empty/first-run state; mobile + desktop; tokens. CI green; reviewer approved.
