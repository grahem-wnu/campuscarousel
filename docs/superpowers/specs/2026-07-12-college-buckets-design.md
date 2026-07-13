# College Buckets (Reach / Target / Safety) — Design

**Date:** 2026-07-12
**Status:** Approved (design), pending spec review
**Module:** `college-hub` (+ profile read, focus queue reuse)

## Problem

A student's college list has no notion of admissions likelihood. Counselors bucket schools into
**reach**, **target**, and **safety** so a family can see at a glance whether the list is balanced.
The app should surface this per college.

Note: `College.status` already contains a value literally named `target` — but that is the
**application lifecycle** (`researching → considering → target → applying → applied → accepted …`),
NOT admissions odds. Buckets are a **separate dimension**. Do not overload `status`.

## Decisions (locked with Grahem)

1. **AI suggests, family overrides.** Every college gets an AI-suggested bucket; the family can
   change it per college.
2. **Auto for every college.** No "classify" button — suggestions appear everywhere automatically.
3. **List groups into three sections + badge.** Reach / Target / Safety sections, a colored badge
   per card, and a bucket filter chip.
4. **No balance nudge** in v1 (e.g. "you have no safety schools"). Deferred.

## Data model

Colleges are already student-scoped (`T#<tenant>#S#<student>#COLLEGE#<id>`), so buckets are
per-student automatically. Add to the `College` type (`backend/shared/data/types.ts`):

```ts
/** Admissions-likelihood bucket. Separate from `status` (application lifecycle). */
suggestedBucket?: 'reach' | 'target' | 'safety';   // AI's call (a Hydratable/system field)
suggestedBucketRationale?: string;                  // one line, e.g. "12% accept, avg GPA 3.8 vs 3.6 → reach"
suggestedBucketConfidence?: 'low' | 'medium' | 'high';
bucket?: 'reach' | 'target' | 'safety';             // family override (a user field); absent = use suggestion
```

- **Effective bucket = `bucket ?? suggestedBucket`.** UI shows the effective value.
- `suggestedBucket*` are **system/hydration fields** — they must NEVER be marked user-edited
  (the #41 lesson). `bucket` is the only user-edited bucket field.
- A re-hydration refreshes `suggestedBucket*` but leaves `bucket` untouched, so an override is
  never stomped.

Add a shared literal + type in `types.ts`:

```ts
export const ADMISSION_BUCKETS = ['reach', 'target', 'safety'] as const;
export type AdmissionBucket = (typeof ADMISSION_BUCKETS)[number];
```

## AI suggestion

It is **reasoning over numbers we already have**, not a web search → a cheap **model-only** call
(`webSearch: false`), well under the API-Gateway 30s ceiling (per the sync-AI ceiling rule). Reuses
the existing Bedrock seam (`BEDROCK_MODEL_ID` env, `invokeMessages`).

**Inputs**
- Student: `profile.currentGPA`, `profile.gpaType` (weighted/unweighted). May be absent.
- College: `acceptanceRateProgram`, `acceptanceRateUniversity`, `avgGPAAdmitted`, `isDirectAdmit`.

**Output** (strict-parsed; `undefined` on any parse/AI error — never throws into the request path):
```ts
{ bucket: AdmissionBucket; rationale: string; confidence: 'low' | 'medium' | 'high' }
```

**Guidance embedded in the prompt** (the model interprets messy strings like "under 20%" or
"3.5–3.8"; we do not regex-parse them):
- **safety** — high acceptance rate (~>60%) AND student GPA at/above the admitted average.
- **reach** — low acceptance rate (~<25%) OR student GPA clearly below the admitted average.
- **target** — student stats near the admitted profile; moderate selectivity.
- **Missing GPA** — bucket off acceptance rate alone, `confidence: 'low'`, and say so in the rationale.
- **Missing acceptance rate too** — return `undefined` (nothing to reason from); college stays Unclassified.

Pure function `suggestBucket(input): Promise<BucketSuggestion | undefined>` in
`backend/modules/college-hub/bucket-ai.ts` — prompt build + parse only, mirroring `ai.ts`/`prep-ai.ts`.

### When it runs — "auto for every college"

Two paths, so nothing needs clicking and coverage self-heals:

1. **New / re-hydrated colleges** — the async hydration worker (`hydration.ts`) already gathers
   acceptance rate + admitted GPA. As its final step it reads the student's profile GPA and calls
   `suggestBucket`, persisting `suggestedBucket*` on the college. (Hydration is student-scoped, so
   the student's profile is reachable.)

2. **Existing colleges** — `GET /colleges` (list handler) enqueues a cheap async **`bucket`** job
   (reusing the **focus queue** so it never contends with bulk hydration) for any college that is
   *hydrated* (`hydratedAt`/`dataAsOf` present) but has no `suggestedBucket`. Fire-and-forget SQS
   send; deduped by a short-lived marker so repeated list loads don't re-enqueue. The `bucket` job
   loads the one college + profile, runs `suggestBucket`, and persists. Buckets fill in within
   seconds of first view.

The `bucket` job is a new message `kind` routed by the existing shared worker
(`hydration.manifest.ts` glob), same pattern as focus/essay-coach kinds.

## API

Mirrors the existing `PATCH /colleges/:id/top-pick`:

- **`PATCH /colleges/:id/bucket`** — body `{ bucket: 'reach' | 'target' | 'safety' | null }`.
  `null` clears the override (revert to the AI suggestion). Sets/clears `College.bucket` only;
  never touches `suggestedBucket*`. Roles: `admin`, `parent`, `student` (student pinned to own
  scope by the router). Validated by a strict zod schema.
- **`GET /colleges`** — add optional `bucket` filter to `listQuerySchema`
  (`z.enum(ADMISSION_BUCKETS).optional()`), filtering on the **effective** bucket.

No new table, GSI, or stack change. The focus queue already exists.

## Frontend

`frontend/src/modules/college-hub/` (follow existing patterns + the Field Notes design system —
Fraunces + paper/ink/evergreen/amber; NO icon-circle/card-grid slop):

- **Grouped list** — three ordered sections **Reach → Target → Safety**, plus an **Unclassified**
  group (colleges with neither `bucket` nor `suggestedBucket` yet). Section header shows the count.
- **Badge** — a small colored bucket pill on each college card (reach = amber, target = evergreen,
  safety = ink/muted — final palette chosen against Field Notes tokens). When `bucket` is set, the
  badge carries a subtle "set by you" affordance; otherwise it reflects the AI suggestion.
- **Picker** — clicking the badge opens a tiny reach/target/safety selector with the AI's rationale
  as a hint and a "use AI's pick" reset (clears the override → `PATCH … {bucket:null}`).
- **Filter chip row** — All / Reach / Target / Safety, driving the `GET /colleges?bucket=` param.

## Privacy / auth

No new privacy surface. Colleges are student-scoped; the student login is pinned to its own scope,
so a student only ever buckets her own colleges, and a parent buckets via `X-Student-Id`. Enforced
at the router off the JWT (existing behavior) — no per-handler auth code.

## Error handling

- `suggestBucket` returns `undefined` on any AI/parse failure or insufficient data → the college
  stays Unclassified; never a 500. AI failures logged (per the web_search-logging precedent).
- The list-handler enqueue is best-effort: a failed SQS send is swallowed and logged; it must never
  break `GET /colleges`.
- `PATCH bucket` validates the enum; a bad value → 422 envelope.

## Testing

**Backend**
- `bucket-ai.test.ts` — table-driven: low-accept → reach; high-accept + strong GPA → safety;
  near-profile → target; missing GPA → confidence `low` + rationale mentions it; missing accept
  rate → `undefined`; malformed AI output → `undefined` (no throw).
- `handlers.test.ts` — `PATCH /colleges/:id/bucket` sets/clears the override; a re-hydration does
  NOT stomp `bucket`; `null` reverts to suggestion; student-scope enforced; bad enum → 422.
- list-handler — enqueues a `bucket` job for a hydrated-but-unbucketed college; does NOT enqueue
  for an already-bucketed or un-hydrated one; enqueue failure doesn't break the list.
- worker routing — a `bucket` message runs `suggestBucket` and persists.

**Frontend** (jsdom)
- Grouping places colleges in the right sections incl. Unclassified.
- Badge renders the effective bucket; "set by you" state when `bucket` present.
- Picker override calls `PATCH … {bucket}`; reset calls `PATCH … {bucket:null}`.

## Out of scope (v1)

- Balance nudge / "add a safety school" prompts.
- SAT/ACT inputs (profile has none; GPA-only is fine, especially for test-optional direct-admit).
- Bucketing scholarships or any non-college entity.
