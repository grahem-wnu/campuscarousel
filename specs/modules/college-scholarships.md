# Module Spec — College Scholarship Research

## Module id
`college-scholarships` (`backend/modules/college-scholarships/`,
`frontend/src/modules/college-scholarships/`)

## Purpose
Inside a college, find the scholarships that school actually offers — academic and athletic — and
then research a chosen award in depth: what it is, the realistic odds, how to win it, what the
process looks like, who runs it, and who to contact.

## Depends on
Foundational: api, data-layer, auth, ai. Module: `college-hub` (owns the `College` entity this hangs
off), `scholarship-tracker` (the "Track this scholarship" hand-off writes a `Scholarship`).

## Owns (entities)
- `CollegeScholarship` — `PK COLLEGE#<collegeId>`, `SK SCHOLARSHIP#<scholarshipId>` (uuid). One
  discovered award plus its optional `research` dossier and `researchStatus`. No GSI.
- `CollegeScholarshipSearch` — `PK COLLEGE#<collegeId>`, `SK SCHOLARSHIPSEARCH` (singleton). The
  per-college search lifecycle: `status`, `category`, `sport`, `found`, `error`, `lastRunAt`.

## API endpoints
| method | path | behavior |
| --- | --- | --- |
| GET | `/colleges/:id/scholarships` | `{ search, scholarships[] }`. 404 if the college is gone. |
| POST | `/colleges/:id/scholarships/search` | Body `{ category?: 'academic'\|'athletic'\|'all', sport?: string }`. Marks the search `in-progress`, enqueues, **202**. |
| GET | `/colleges/:id/scholarships/:scholarshipId` | One award (research polling). 404 when absent. |
| POST | `/colleges/:id/scholarships/:scholarshipId/research` | Marks `researchStatus: 'in-progress'`, enqueues, **202**. |
| DELETE | `/colleges/:id/scholarships/:scholarshipId` | Remove one result. |

All zod-validated (`schema.ts`); unknown body fields → 422. Any authenticated family member of the
tenant may read and run both jobs; view-only members are blocked from the mutating routes by the
shared router's role guard.

## Frontend
A **Scholarships** tab on `/colleges/:id`, after *Prepare*.

- Category chips **All / Academic / Athletic**; picking Athletic reveals an optional sport input.
- First visit with no prior search auto-runs one; afterwards the tab shows the stored results with a
  **Search again** action and the last-run timestamp.
- Results populate a `<select>` grouped by category (`optgroup` Academic / Athletic / Other). The
  selected award renders a compact card (amount, deadline, renewable, link).
- **Research this scholarship** starts the dossier job and polls; the dossier renders as labeled
  sections — Odds, How to win it, What to expect, How to apply, Deadlines, Who to contact, Staff,
  Tips, Common mistakes — followed by cited sources and an "as of" line.
- **Track this scholarship** posts the award into Scholarship Tracker with `linkedColleges` set.
- Empty state when a search legitimately finds nothing; error state with retry when a job fails.

## AI behavior
Two Bedrock calls, both **web-grounded** (`converseWithSearch`, `webSearch: true`) and both **async
on the 300s SQS worker** — never on the 30s request path.

- **Search** (`feature: 'scholarship-search'`, `maxRounds` 5, `maxTokens` 4000): "list the
  scholarships available at `<college>` for a student pursuing `<majors>`", scoped to the requested
  category. Returns a JSON array of award summaries.
- **Research** (`feature: 'scholarship-research'`, `maxRounds` 6, `maxTokens` 6000): a single-award
  dossier as one JSON object, schema in `research.ts`.

Prompt rules: never invent a person, email, phone, or URL — omit instead; odds are labeled estimates
with their basis stated; prefer the school's own `.edu`, athletics, and department pages; stamp
`asOf`; return every source consulted. College and award names are wrapped with `promptLiteral()`.

Message routing: `type: 'college-scholarship'`, then `kind: 'search' | 'research'`. Queue is
`SCHOLARSHIP_QUEUE_URL ?? FOCUS_QUEUE_URL ?? HYDRATION_QUEUE_URL`; enqueue failure runs inline.

## Privacy
No visibility-bearing fields. Scholarships are family-visible, matching `scholarship-tracker`.
Tenant + student scoping comes from the shared data client (the college partition is already
`T#<t>#S#<s>#COLLEGE#<id>`), so no module-level filtering is required.

## File-ownership boundary
Create/edit only `backend/modules/college-scholarships/**`,
`frontend/src/modules/college-scholarships/**`, `specs/modules/college-scholarships.md`, plus the
two shared-contract additions this entity requires (`backend/shared/data` types/collections/index)
and the single tab wiring line in `college-hub/CollegeDetailPage.tsx`.

## Acceptance criteria
- [x] Every endpoint implemented, zod-validated, and unit-tested.
- [x] Prompt builders + parsers pure and unit-tested (malformed output, fabricated URLs, dedupe).
- [x] Both jobs async with polling; nothing web-grounded on the request path.
- [x] Frontend tab with empty / searching / results / researching / dossier / error states.
- [x] No hardcoded config; CI green.
