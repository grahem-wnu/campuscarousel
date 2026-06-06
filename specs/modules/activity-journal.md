# Module Spec — Activity Journal

> This is the **vertical-slice** module (Gate 2). It proves the whole pipeline end to end:
> auth + data layer + API + frontend + deploy. Build it first, deploy to staging, Grahem tests it.

## Module id
`activity-journal`

## Purpose
The core data-accumulation engine. Every meaningful thing Keira does gets logged here: fast entry,
timeline/calendar/summary views, weekly reflection prompts. Reflections are the raw material for
essays later.

## Depends on
`foundational/data-layer`, `foundational/auth`, `foundational/api`, `foundational/design-system`.

## Owns (entities)
**Activity / Journal Entry** (`PK: ACTIVITY#<id>`, `SK: DETAILS`; GSI1 by date, GSI2 by category).
Fields per master spec: userId, date, category, subcategory, title, description, hours, reflection,
`visibility` (`family`|`private`), `isReflection`, tags, linkedColleges, timestamps.

## API endpoints
- `GET /activities` — list; filters category, dateRange; **visibility-filtered for requester**
  (parents never see keira's private entries; keira sees all hers).
- `GET /activities/:id` — detail; `assertCanRead` (403 if a parent fetches a private entry).
- `POST /activities` — create. Any user may log on Keira's behalf; record `userId` = creator.
  `visibility` defaults `family`; only keira may set `private`.
- `PUT /activities/:id` — update.
- `DELETE /activities/:id` — delete.
- `GET /activities/summary` — aggregate: hours by category, counts by month (visibility-filtered).

All validated with zod; identity from JWT; reads through the visibility middleware.

## Frontend
- **Timeline view** (default): chronological feed, filter by category + date range, shows who
  created each entry.
- **Calendar view**: monthly grid with activity dots.
- **Summary view**: hours-by-category + charts over time.
- **Quick-add form** (must take < 30s): date (default today), category dropdown, subcategory,
  title, optional hours, optional description, **visibility toggle** (Family default / Private —
  Private only offered when keira is the user), tags chips. Reachable from the app-wide FAB.
- **Weekly reflection prompt**: once/week, rotating question; response saved as a `personal` entry
  with `isReflection: true`.
- Empty state explaining what the journal is and how to start. Spacious density. Mobile + desktop.

## AI behavior
None directly. (Its data feeds the AI Assistant + Essay modules later.)

## Privacy
`visibility` is the visibility-bearing field. Every list/detail/summary read MUST go through the
visibility middleware (`filterForRequester` / `assertCanRead`). This is the module's hardest test.

## File-ownership boundary
Create/edit ONLY: `backend/modules/activity-journal/**`,
`frontend/src/modules/activity-journal/**`, the two manifests, and this spec. Consume foundational
contracts; never edit them.

## Acceptance criteria
- [ ] All 6 endpoints implemented, zod-validated, unit + integration tested.
- [ ] **Privacy tests pass:** parent cannot list/get/aggregate a private entry; keira can; default
      is family; only keira can set private.
- [ ] Three views + quick-add + weekly reflection prompt, empty state, mobile + desktop, tokens.
- [ ] No hardcoded config; only owned paths touched; CI green; spec-reviewer approved.
- [ ] Deployed to staging; Grahem can log in as keira, add an activity, and confirm a parent
      login cannot see a private entry (Gate 2).
