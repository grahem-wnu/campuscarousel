# Module Spec — "Why Nursing" Living Document

## Module id
`why-nursing`

## Purpose
A growing collection of moments, realizations, conversations, observations, and inspirations that
crystallize why Keira wants to be a critical-care nurse. The raw material for authentic essays.

## Depends on
All foundational specs. Linked from `activity-journal` and `clinical-hours`. Consumed by
`application-central` + `ai-assistant` (essay partner) + `interview-prep`.

## Owns (entities)
**Why Nursing Entry** (`WHYNURSING#<id>/DETAILS`: date, title, content (no length limit), category
[moment|realization|conversation|observation|inspiration], linkedActivityId?, linkedClinicalId?,
tags[], `visibility` [family|private]).

## API endpoints
`GET /why-nursing` (filter category; **visibility-filtered**); `GET /why-nursing/:id`
(`assertCanRead`); `POST /why-nursing`; `PUT /why-nursing/:id`; `DELETE /why-nursing/:id`.

## Frontend
- Entry form: date, evocative title, full narrative, category, optional link to a journal/clinical
  entry, tags, visibility.
- Timeline view: chronological stream; each category has a distinct icon/color; shows the evolution
  of her "why" over months/years.
- Empty state that invites the first capture; mobile + desktop.

## AI behavior
None directly, but its entries are prime essay/interview material (read by those modules). The AI
may prompt for new entries ("3 weeks since your last Why Nursing entry — anything from clinical?").

## Privacy
`visibility`-bearing — and the most personal data in the app. Reads through the visibility
middleware. Private entries reach the AI only when keira is the authenticated caller; never shown
to parents.

## File-ownership boundary
`backend/modules/why-nursing/**`, `frontend/src/modules/why-nursing/**`, the two manifests, this spec.

## Acceptance criteria
- [ ] CRUD + category filter + linking to journal/clinical entries implemented + tested.
- [ ] **Privacy test:** parent blocked from private entries; keira allowed; AI set respects requester.
- [ ] Timeline view with per-category styling; inviting empty state; mobile + desktop.
- [ ] CI green; reviewer approved.
