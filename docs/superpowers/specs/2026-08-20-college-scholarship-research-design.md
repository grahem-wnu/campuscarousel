# College Scholarship Research — design

**Date:** 2026-08-20
**Status:** approved (Grahem authorized independent build → staging → prod)
**Modules:** `backend/modules/college-scholarships`, `frontend/src/modules/college-scholarships`

## Problem

A family shortlists colleges, but the money question is answered somewhere else entirely (the
standalone Scholarship Tracker) and only in generic terms. Nobody knows what *this* school actually
offers, whether a kid could realistically win it, or who to email about it. The research a parent
would otherwise do — reading a school's financial-aid pages, the athletics compliance page, the
department's endowed-award list, then calling the coordinator — is exactly the work the app should
do.

## What we're building

Inside a college (`/colleges/:id`) a **Scholarships** tab that does two things:

1. **Search** — a web-grounded sweep for scholarships available *at this school*, filtered to
   **academic**, **athletic**, or **all**. Results persist on the college.
2. **Research** — the user picks one result from a dropdown, clicks **Research**, and gets a deep
   dossier on that single award: details, odds, how to win it, what to expect, how to apply, who
   the staff are, and who to contact.

## Why two AI passes, not one

A single "find and fully research 10 scholarships" call would be enormous, slow, and mostly wasted —
a family cares about two or three. Splitting it keeps the search cheap and broad, and spends the
expensive multi-round web research only on the award the user actually chose. It also gives the UI
two honest progress states instead of one long opaque spinner.

## Data model

Both new entities hang off the college partition (`PK = COLLEGE#<collegeId>`), matching notes /
touchpoints / checklist.

### `CollegeScholarship` — child item, `SK = SCHOLARSHIP#<uuid>`

One discovered award. Search fills the summary fields; research fills `research`.

| field | notes |
| --- | --- |
| `collegeId`, `scholarshipId` | keys |
| `name` | the anchor; dedupe is by normalized name |
| `category` | `academic` \| `athletic` \| `other` |
| `sport` | set for athletic awards |
| `provider` | school, department, foundation, athletics dept |
| `amount`, `amountDescription` | numeric when a single figure is known; prose otherwise |
| `deadline` | ISO date when known |
| `url` | application/info page |
| `renewable`, `eligibility[]`, `summary` | one-line search-level facts |
| `research` | `ScholarshipResearch` — the dossier (see below) |
| `researchStatus` | `pending` \| `in-progress` \| `complete` \| `failed` |
| `researchedAt` | ISO timestamp of the last successful dossier |

Child items (not one fat blob on the college) because a dossier is multiple KB and a family may
research many awards; DynamoDB's 400KB item limit makes an embedded list a real ceiling.

### `ScholarshipResearch` — the dossier

`summary`, `award{amount,renewable,numberAwarded,duration,stackable}`,
`odds{competitiveness,estimate,applicantPool,selectionRate,whatSetsWinnersApart[]}`,
`howToWin[]`, `whatToExpect[]`, `applicationSteps[]`, `requiredMaterials[]`,
`deadlines[]`, `contacts[]`, `staff[]`, `tips[]`, `redFlags[]`, `applicationUrl`,
`sources[]`, `asOf`.

`competitiveness` is a closed union (`very-high|high|moderate|accessible|unknown`) so the UI can
color a badge; every other odds field is prose, because honest selectivity data is rarely a number
and a fabricated percentage would be worse than a sentence.

### `CollegeScholarshipSearch` — per-college singleton, `SK = SCHOLARSHIPSEARCH`

`status`, `category`, `sport`, `found`, `error`, `lastRunAt`. Lets the tab render "last searched
Tuesday, 9 found" and drive the polling spinner without scanning children.

## API

| route | behavior |
| --- | --- |
| `GET /colleges/:id/scholarships` | `{ search, scholarships[] }` — the singleton + all children |
| `POST /colleges/:id/scholarships/search` | 202; marks the singleton `in-progress`, enqueues |
| `GET /colleges/:id/scholarships/:sid` | one child (research polling) |
| `POST /colleges/:id/scholarships/:sid/research` | 202; marks the child `in-progress`, enqueues |
| `DELETE /colleges/:id/scholarships/:sid` | drop a result the family doesn't care about |

All are family-visible: scholarships carry no `visibility` flag (same as Scholarship Tracker), so
there is no private-entry rule here. Tenancy/student scoping is inherited from the shared data
client — the college partition is already `T#<t>#S#<s>#COLLEGE#<id>`.

## Async execution

Both jobs are web-grounded (multi-round Tavily + Bedrock) and run 60–180s, far past API Gateway's
hard ~30s ceiling. So both follow the established enqueue-and-poll pattern:

- API marks status `in-progress`, enqueues, returns **202**.
- The 300s SQS worker (`backend/dist/hydration`, which globs every module's `hydration.manifest.ts`)
  routes message `type: 'college-scholarship'` here, then routes by `kind: 'search' | 'research'`.
- The frontend polls until the status settles.

Token budgets are bounded by that 300s worker timeout: search gets 5 rounds / 4000 tokens, research
6 rounds / 6000 tokens. A run that overshot 300s would be redelivered by SQS mid-write rather than
failing cleanly, so the ceilings sit comfortably under it.

Queue selection is `SCHOLARSHIP_QUEUE_URL ?? FOCUS_QUEUE_URL ?? HYDRATION_QUEUE_URL`. The first is
unset today, so jobs land on the existing **interactive focus lane** — web search is already enabled
there and no CDK change is required. Setting the env var later moves it to a dedicated lane without
a code change. Enqueue failure degrades to running inline, exactly like every other dispatcher here.

## Honesty rules for the AI

The dossier is the kind of content a family will act on — emailing a named person, planning around a
deadline. So the prompts are explicit:

- Never invent a person, email, phone number, or URL. Omit the field instead.
- Odds are an estimate; say so, and state what the estimate is based on.
- Prefer the school's own pages (`.edu`), athletics site, and the department's award list.
- Stamp `asOf` with the academic year the figures reflect, and return every source URL consulted.

The UI reinforces this: sources are listed, and a standing note says to confirm details with the
school. `promptLiteral()` wraps untrusted college/scholarship names so a name can't smuggle
instructions into the prompt, matching the security hardening already in place.

## Frontend

`frontend/src/modules/college-scholarships/` — `api.ts`, `types.ts`, `logic.ts` (+ tests),
`ScholarshipsTab.tsx`, `ResearchView.tsx`. The tab slots into `CollegeDetailPage` beside Prepare.

Flow: category chips (All / Academic / Athletic + sport input) → auto-search on first visit →
`<select>` grouped by category → selected-award card → **Research this scholarship** → dossier.

A researched dossier also offers **Track this scholarship**, which POSTs to the *existing*
`/scholarships` tracker with the award prefilled and `linkedColleges` set — so a found award becomes
a tracked deadline without retyping. No new backend for that; it reuses Scholarship Tracker.

## Testing

Pure prompt builders and parsers are unit-tested with no AWS (the house pattern): malformed model
output, partial objects, fabricated-URL rejection, category clamping, dedupe-by-name on re-search.
Handler tests use the in-memory table client and injected fake generators. Frontend logic (grouping,
labels, badge tone) is unit-tested; the tab gets a jsdom render test for the empty → searching →
results → dossier states.

## Out of scope

Auto-researching every result (cost), scholarship *application* submission, and non-college-specific
scholarships (the standalone Scholarship Tracker already owns those).
