# Module Spec — College Hub

## Module id
`college-hub`

## Purpose
Research, track, compare, and manage target colleges. The most data-heavy module. App starts
empty; all college data is discovered and hydrated via real-time AI web search. Also hosts
per-college tabs for touchpoints, campus visits, and benchmarks (those sub-features may be
co-owned with their modules via shared sub-entities — see Depends on).

## Depends on
All foundational specs. Async hydration via the AsyncStack SQS queue (infra). Per-college tabs
integrate with `demonstrated-interest-contacts` (touchpoints), `campus-visit-planner` (visits),
`peer-benchmark` (benchmark) — those modules own their sub-entities under `COLLEGE#<id>`.

## Owns (entities)
**College** (`COLLEGE#<id>/DETAILS`), **College Note** (`COLLEGE#<id>/NOTE#<ts>`), **Checklist**
(`COLLEGE#<id>/CHECKLIST`). Full field set per master spec (branding, contactInfo, deadlines,
programType, status, hydrationStatus, fitScore, `userEdited[]`, etc.).

## API endpoints
`GET /colleges` (filters: status, programType, state, isTopPick, search, sortBy, sortOrder);
`GET /colleges/:id`; `POST /colleges` (min: name → auto-hydrate); `PUT /colleges/:id` (edits set
`userEdited[]`); `DELETE /colleges/:id` (soft delete → status removed); `PATCH /colleges/:id/top-pick`;
`POST /colleges/:id/hydrate`; `POST /colleges/hydrate-all`; `POST /colleges/discover` (filters,
returns results, no auto-add); `POST /colleges/bulk-add`; `GET/POST /colleges/:id/notes`;
`PUT /colleges/:id/checklist`.

## Frontend
First-run empty state + "Discover BSN Programs" flow (filters or Find All; results with
checkboxes → Add All/Selected). List view (card/table toggle) with logo, program-type badge,
top-pick star, status, hydration indicator; sort + filter + cost slider; bulk Refresh/Export.
Detail view: branded header (logo, mascot, school colors, contact quick-actions) + tabs Overview
(editable fields, "data not found" flags, Refresh + last-refreshed), Notes, Checklist (progress
bar), Fit Analysis (AI), Essays (links to application-central), plus Touchpoints/Visits/Benchmark
tabs. Comparison view (2-4 side by side, budget impact).

## AI behavior
Discovery + hydration via Bedrock + web search, **async via SQS** (return job id, poll status).
Hydration prompt returns JSON matching the College schema; preserve `userEdited[]` fields. Logo:
store URL, hotlink (Clearbit fallback), graduation-cap fallback on load error. Fit Analysis:
Bedrock vs Keira's profile.

## Privacy
College data is family-visible. No private-bearing fields here.

## File-ownership boundary
`backend/modules/college-hub/**`, `frontend/src/modules/college-hub/**`, the two manifests, this
spec. Touchpoint/visit/benchmark sub-entities are owned by their respective modules.

## Acceptance criteria
- [ ] CRUD + discovery + hydration (async, idempotent, userEdited preserved) implemented + tested.
- [ ] List sort/filter/search; detail tabs; comparison; soft delete/restore; branding + fallbacks.
- [ ] No hardcoded config (model id, queue url from SSM/env); CI green; reviewer approved.
