# Module Spec — Application Central

## Module id
`application-central`

## Purpose
Senior-year command center: application tracker, the essay workspace (the killer feature),
recommendation strategy board, and test-score tracker.

## Depends on
All foundational specs. Reads `college-hub` (schools, deadlines, prompts), `activity-journal`,
`clinical-hours`, `why-nursing` (essay source material), `demonstrated-interest-contacts`
(recommenders). Uses `ai-assistant` essay-partner capability. Build in a later wave.

## Owns (entities)
**Essay** (`ESSAY#<id>/DETAILS`: collegeId, prompt, promptSource, drafts[], status,
aiSuggestedActivities[], aiSuggestedAngles[], notes). Test-score records and recommendation
tracking (model as `APPLICATION#...` sub-entities or dedicated keys — define in data-layer if a
new key is needed; raise to supervisor).

## API endpoints
`GET/POST /essays`, `GET/PUT/DELETE /essays/:id`; `POST /essays/:id/find-experiences` (AI finds
relevant journal/clinical/why-nursing entries — **includes keira's private entries when keira is
authenticated**); `POST /essays/:id/review` (AI feedback, does NOT rewrite). Application status,
recommendation, and test-score endpoints per master spec (tracker tables).

## Frontend
- **Application tracker**: one row per college; columns deadline, status, essay/rec/transcript/
  scores/financial-aid status; deadline countdown color-coded.
- **Essay workspace**: prompt display; AI context sidebar ("Find relevant experiences", suggested
  angles, "What makes me unique for this school?"); rich-text editor; version history; word count
  vs target; "Check my essay" (feedback only, no rewrite).
- **Recommendation strategy board**: 4 slots (STEM teacher, humanities teacher, clinical/volunteer
  supervisor, community leader); assigned contact, relationship strength, ask timeline; AI
  recommender brief per contact; status asked→agreed→received→submitted.
- **Test-score tracker**: SAT/ACT, TEAS, AP; which schools received which scores.
- Decision matrix (when acceptances arrive). Empty states; mobile + desktop.

## AI behavior
Essay partner mode: full access to all of Keira's accumulated data **including private entries
when keira is authenticated**. Suggests experiences + angles + structural/authenticity feedback;
never writes the essay. Recommender brief generation. Synchronous Bedrock calls.

## Privacy
The essay AI path is the canonical case where private entries ARE included — but only when keira
is the authenticated caller. Use `aiVisibleSet(items, requester)`. Never surface private content
in any response visible to a parent.

## File-ownership boundary
`backend/modules/application-central/**`, `frontend/src/modules/application-central/**`, the two
manifests, this spec.

## Acceptance criteria
- [ ] Essay CRUD + drafts/versions; find-experiences + review (no rewrite); rec board; score tracker.
- [ ] **Privacy test:** essay AI includes keira's private entries for keira, excludes them for parents.
- [ ] Application tracker with deadline countdowns; decision matrix; mobile + desktop.
- [ ] CI green; reviewer approved.
