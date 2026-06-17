# Module Spec — Peer Benchmark Dashboard

## Module id
`peer-benchmark`

## Purpose
Show what a competitive admitted student looks like at each target school and where Keira stands.
Turns abstract goals into concrete, measurable gaps.

## Depends on
All foundational specs. Reads `course-planner` (GPA), `teas-prep` (TEAS), `clinical-hours`,
`activity-journal` (volunteer hours), `certifications`. Benchmark attaches to colleges
(`college-hub` detail tab). Bedrock + web search (admitted-student profiles).

## Owns (entities)
**Peer Benchmark** (`COLLEGE#<collegeId>/BENCHMARK`: avgGPAAdmitted, avgTEASScore, avgSATScore?,
typicalClinicalHours, typicalVolunteerHours, typicalCertifications[], typicalExtracurriculars,
competitiveEdges[], keirasComparison {gpaStatus, teasStatus, clinicalHoursStatus,
volunteerHoursStatus, overallReadiness}, lastDataRefresh).

## API endpoints
`GET /colleges/:id/benchmark`; `POST /colleges/:id/benchmark/refresh` (ASYNC — creates a refresh
job, enqueues web-grounded AI research on the SQS worker, returns 202 with the job; the web search
exceeds API Gateway's 30s ceiling so it cannot run on the request path); `GET
/colleges/:id/benchmark/refresh/:jobId` (poll job status — pending/complete/failed; the worker merges
the researched profile into the stored benchmark, preserving human edits); `GET /benchmarks/aggregate`
(matrix: all colleges × metrics, Keira's stats compared); `GET /benchmarks/gaps` (AI biggest-gaps
analysis with specific recommendations — synchronous, model-only).

## Frontend
- Per-college benchmark tab: comparison card (GPA, TEAS, clinical hours, volunteer hours, certs,
  extracurriculars — school typical vs Keira's, with status indicators); readiness badge (Strong
  Match / Competitive / Needs Work / Insufficient Data); "Refresh Benchmark".
- Aggregate view (standalone): matrix all colleges × metrics; Keira's stats highlighted; color
  coding (green exceeds / yellow meets / red below / gray no data); biggest-gaps callout.
- Progress over time: monthly snapshot of Keira vs benchmarks; AI commentary on closing gaps.
- Empty state; mobile + desktop.

## AI behavior
`benchmark/refresh` → Bedrock + web search for admitted-student profiles, run ASYNC on the 300s SQS
worker (shares the hydration queue, own message `type: 'benchmark-refresh'`); the request path only
enqueues a job. `benchmarks/gaps` synthesizes the already-fetched matrix → model-only, synchronous.
Keira's comparison fields auto-computed from her real data (read the source modules). The PERSISTED
`keirasComparison` is computed from family-visible stats (private entries excluded); the per-caller
live comparison on `GET /benchmark` is recomputed off the JWT.

## Privacy
Family-visible (uses Keira's aggregate stats, not private entry content).

## File-ownership boundary
`backend/modules/peer-benchmark/**`, `frontend/src/modules/peer-benchmark/**`, the two manifests,
this spec. Benchmark is a sub-entity under `COLLEGE#`; college-hub renders the tab via manifests.

## Acceptance criteria
- [ ] Per-college benchmark + auto-computed Keira comparison + aggregate matrix + gaps analysis + tested.
- [ ] Readiness badges; color-coded matrix; progress-over-time; empty state; mobile + desktop.
- [ ] CI green; reviewer approved.
