# Module Spec — Demonstrated Interest + Contact Network

## Module id
`demonstrated-interest-contacts`

## Purpose
Track every touchpoint with target schools (info sessions, emails, visits) and build a contact
network (nurses, admissions counselors, mentors, supervisors) who become recommenders and
differentiators.

## Depends on
All foundational specs. Touchpoints attach to colleges (`college-hub` detail tab). Contacts feed
`application-central`'s recommendation board. Bedrock (recommender briefs).

## Owns (entities)
**Touchpoint** (`COLLEGE#<collegeId>/TOUCHPOINT#<ts>`: type, date, description, contactPerson?,
contactEmail?, contactPhone?, followUpNeeded, followUpDate?, followUpCompleted, notes, createdBy).
**Contact** (`CONTACT#<id>/DETAILS`: name, role, organization, relationship, phone?, email?,
linkedCollegeId?, howMet, dateMet, lastContactDate, notes, isPotentialRecommender, recommenderSlot?).

## API endpoints
`GET/POST /colleges/:id/touchpoints`, `PUT/DELETE /colleges/:id/touchpoints/:tid`,
`GET /touchpoints/follow-ups` (all pending follow-ups across colleges);
`GET/POST /contacts`, `GET/PUT/DELETE /contacts/:id`, `GET /contacts/recommenders` (grouped by slot),
`POST /contacts/:id/recommender-brief` (AI one-page profile summary for a recommender).

## Frontend
- Demonstrated-interest tab on each college detail page: chronological interaction log; entry types
  (info-session, campus-visit, email, call, webinar, fair, interview, social); "N touchpoints" badge
  on the college list; AI insight on interest strength.
- Contact network (standalone): rolodex view; filter by relationship/org/linked college; potential-
  recommender flag + slot assignment.
- Recommender briefs surfaced into application-central's board. Empty states; mobile + desktop.

## AI behavior
`recommender-brief` → Bedrock generates a one-page summary of Keira's activities/goals/achievements
for a recommender. Network insights ("you have 3 clinical-supervisor recommenders but none in
humanities"). Sync.

## Privacy
Family-visible.

## File-ownership boundary
`backend/modules/demonstrated-interest-contacts/**`,
`frontend/src/modules/demonstrated-interest-contacts/**`, the two manifests, this spec. Touchpoints
are this module's sub-entities under `COLLEGE#`; college-hub renders the tab via the nav/route manifest.

## Acceptance criteria
- [ ] Touchpoint CRUD (per college) + follow-ups view + contact CRUD + recommender grouping + briefs.
- [ ] College-list touchpoint badge; rolodex filters; recommender slot assignment; empty states.
- [ ] CI green; reviewer approved.
