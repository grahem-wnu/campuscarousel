# Module Spec — Scholarship Discovery + Tracker

## Module id
`scholarship-tracker`

## Purpose
Find and track nursing/healthcare/community-service/state/college-specific scholarships to stretch
the $200K budget. AI discovery via web search; status + deadline + budget-impact tracking.

## Depends on
All foundational specs. Async via SQS (hydration). Reads `college-hub` (school-specific), `budget`.

## Owns (entities)
**Scholarship** (`SCHOLARSHIP#<id>/DETAILS`): name, provider, amount, amountDescription, type,
eligibility[], applicationDeadline, applicationUrl, requiredMaterials[], linkedColleges[],
isRenewable, renewalRequirements, status, awardedAmount, notes, addedBy, lastDataRefresh.

## API endpoints
`GET /scholarships` (filters type/status/linkedCollege/deadline); `GET /scholarships/:id`;
`POST /scholarships` (auto-hydrate); `PUT /scholarships/:id`; `DELETE /scholarships/:id`;
`POST /scholarships/discover` (web search → results for selection); `POST /scholarships/bulk-add`;
`POST /scholarships/:id/hydrate`; `GET /scholarships/summary` (total tracked, total awarded, budget impact).

## Frontend
- "Discover Scholarships" → AI web search → selectable results.
- List (card/table) sortable by deadline/amount/status; filters; color-coded deadlines (red <30d,
  yellow <90d); total potential value + total awarded at top.
- Detail: structured data, application checklist, Refresh, notes, application link, linked colleges.
- Budget integration: dashboard shows budget + awarded = adjusted; "what-if" affordability view.
- Empty state; mobile + desktop.

## AI behavior
Discovery + hydration via Bedrock + web search (async via SQS for bulk). Structured results.

## Privacy
Family-visible.

## File-ownership boundary
`backend/modules/scholarship-tracker/**`, `frontend/src/modules/scholarship-tracker/**`, the two
manifests, this spec.

## Acceptance criteria
- [ ] CRUD + discovery + hydrate + summary (budget impact) implemented + tested.
- [ ] Sortable/filterable list with color-coded deadlines; what-if affordability; empty state.
- [ ] No hardcoded config; CI green; reviewer approved.
