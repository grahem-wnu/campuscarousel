# Data-access library (FROZEN CONTRACT)

The single-table data layer. Workers **consume** this; they never write raw DynamoDB calls and
never modify this library. See `specs/foundational/data-layer.md` and the master spec
("Data Model").

## Use it

```ts
// In a Lambda handler (CDK injects TABLE_NAME):
import { dataFromEnv } from '../../shared/data';
const data = dataFromEnv();
const activity = await data.activities.create({
  userId: 'keira', date: '2026-01-15', category: 'volunteer',
  title: 'Hospital volunteering', hours: 3, visibility: 'family',
});
const recent = await data.activities.listByDateRange('2026-01-01', '2026-01-31');
const byCat  = await data.activities.listByCategory('clinical');
```

```ts
// In a unit/integration test (no AWS):
import { makeData, InMemoryTableClient } from '../../shared/data';
import { seed } from '../../shared/data/fixtures';
const data = makeData(new InMemoryTableClient());
const ids = await seed(data);
```

## Accessors

- Standard entities (`create/get/require/update/delete/list/listByDateRange`):
  `activities`, `clinical`, `teas`, `colleges`, `scholarships`, `goals`, `courses`, `essays`,
  `certifications`, `interviews`, `whyNursing`, `contacts`.
  - `activities.listByCategory(category)` (GSI2), `clinical.listByFacility(facility)` (GSI3),
    `teas.list()` / `teas.listByDateRange()` (GSI4).
  - Hydratable (`colleges`, `scholarships`): `mergePreservingUserEdits(id, aiData)` re-applies
    AI data **without** overwriting any field a human edited via `update()`.
- College sub-entities (parent partition `COLLEGE#<id>`): `collegeNotes`, `touchpoints`,
  `visits` (`add/get/update/delete/list` by collegeId); `collegeChecklist`, `benchmarks`
  (per-college singletons; `benchmarks.mergePreservingUserEdits`).
- `conversations` (`create/get/list/addMessage/listMessages`).
- Singletons: `budget` (global), `profiles` (per `userId`).

The library stamps `createdAt`/`updatedAt` (ISO-8601 UTC) and generates ids
(`crypto.randomUUID`). It returns clean domain objects (no `PK`/`SK`/`GSI*` attributes).

## Required table + index schema (for the infra DataStack)

> ⚠️ **Infra coordination:** `foundational-infra` (DataStack) must provision the table and GSIs
> with **exactly** these attribute names, or production queries fail. The in-memory client used
> by tests simulates them, so this library is testable independently — but the deployed table
> must match. This is the canonical schema; please mirror it in DataStack.

- **Table:** single table, on-demand, PITR on. Primary key: `PK` (string, HASH), `SK` (string, RANGE).
- **GSI1** — generalised "list a collection by date":
  `GSI1PK` (HASH), `GSI1SK` (RANGE). Partition values: `ACTIVITIES`, `CLINICAL`, `COLLEGES`,
  `SCHOLARSHIPS`, `GOALS`, `COURSES`, `ESSAYS`, `CERTIFICATIONS`, `INTERVIEWS`, `WHYNURSING`,
  `CONTACTS`, `CONVERSATIONS`. Sort: `<date-or-createdAt>#<id>`.
- **GSI2** — activities by category: `GSI2PK` = `CATEGORY#<category>`, `GSI2SK` = `<date>#<id>`.
- **GSI3** — clinical by facility: `GSI3PK` = `FACILITY#<facility>`, `GSI3SK` = `<date>#<id>`.
- **GSI4** — TEAS by date: `GSI4PK` = `TEAS_SCORES`, `GSI4SK` = `<date>#<id>`.

All GSIs project `ALL`. Indexes are sparse: only items carrying the relevant `GSI*PK` attribute
appear in that index (e.g. college sub-entities don't pollute `COLLEGES`).

## Key map (entities → keys)

| Accessor | PK | SK | Collection (GSI1PK) |
|----------|----|----|---------------------|
| activities | `ACTIVITY#<id>` | `DETAILS` | `ACTIVITIES` (+GSI2) |
| clinical | `CLINICAL#<id>` | `DETAILS` | `CLINICAL` (+GSI3) |
| teas | `TEAS#<id>` | `DETAILS` | — (GSI4) |
| colleges | `COLLEGE#<id>` | `DETAILS` | `COLLEGES` |
| collegeNotes | `COLLEGE#<id>` | `NOTE#<ts>` | — |
| touchpoints | `COLLEGE#<id>` | `TOUCHPOINT#<ts>` | — |
| visits | `COLLEGE#<id>` | `VISIT#<uuid>` | — |
| collegeChecklist | `COLLEGE#<id>` | `CHECKLIST` | — |
| benchmarks | `COLLEGE#<id>` | `BENCHMARK` | — |
| scholarships | `SCHOLARSHIP#<id>` | `DETAILS` | `SCHOLARSHIPS` |
| goals | `GOAL#<id>` | `DETAILS` | `GOALS` |
| courses | `COURSE#<id>` | `DETAILS` | `COURSES` |
| essays | `ESSAY#<id>` | `DETAILS` | `ESSAYS` |
| certifications | `CERT#<id>` | `DETAILS` | `CERTIFICATIONS` |
| interviews | `INTERVIEW#<id>` | `DETAILS` | `INTERVIEWS` |
| whyNursing | `WHYNURSING#<id>` | `DETAILS` | `WHYNURSING` |
| contacts | `CONTACT#<id>` | `DETAILS` | `CONTACTS` |
| conversations | `CONVERSATION#<id>` | `DETAILS` / `MESSAGE#<ts>` | `CONVERSATIONS` |
| budget | `BUDGET` | `DETAILS` | — |
| profiles | `USER#<id>` | `PROFILE` | — |
