# course-planner — checkpoint

## spec-reviewer @ 2026-06-06T18:10Z — PR #18 (head 55b825b) — 🔴 CHANGES REQUESTED

Reviewed `feat/course-planner` (+1745/-0, 20 files) against `specs/modules/course-planner.md`.
Strong module — GPA math is correct and well-tested, boundary clean, authz/config clean. One
blocking conformance fix (nav), plus a cross-module scope note for Grahem.

**No hard fails:** three-dot boundary strictly within `backend/modules/course-planner/**` +
`frontend/src/modules/course-planner/**` (verified); no shared-contract edits; no secrets/hardcoded
model-id/table/account (`dataFromEnv()`, no `process.env` in module code); authz off the JWT (401
proven via shared router; no `createdBy`/owner field on the `Course` entity so nothing client-trusted);
family-visible → no private path. Single-table: one-item-per-course via the frozen `courses`
accessor (`COURSE#<id>/DETAILS`); colleges read via `colleges.get`; no new table. CI green; 46 tests.

**GPA verified (I checked `gpa.ts` myself — highest-risk area):** standard 4.0 letter scale
(A+..F, null for ungraded); rigor bonus AP/dual-enrollment +1.0, honors +0.5, or explicit
`gradePoints` override; credit-hour weighted (× units, default 1); ungraded/planned/in-progress
excluded (`base===null → continue`); empty/no-graded → 0 (no divide-by-zero); rounded to 3 dp.
Tested across simple/weighted/override/units/ungraded/empty + frontend mirror. Correct.

### Required — worker-actionable (in your lane)

1. **[Conformance] `frontend/src/modules/course-planner/nav.manifest.ts:11` — `group: 'primary'`.**
   The design-system spec (`specs/foundational/design-system.md:18-20`) fixes the 5 primary tabs as
   Dashboard / Journal / Colleges / Scholarships / Timeline; `frontend/src/shared/shell/nav.ts`
   filters by group with no cap, so a 6th `primary` entry overflows the fixed top/bottom bar. Course
   Planner isn't one of the five. Fix: `group: 'secondary'` (`order: 40` is fine). (Same fix
   goal-tracker just made.)

### For Grahem (product / cross-module decision)

2. **[Completeness — spec L28 "prereq matrix"] PrereqChecker is single-college, not the full
   courses × target-colleges matrix.** The spec asks for a matrix; the module ships a one-college
   checker on the `GET /courses/prerequisites/:collegeId` contract because **college-hub (the college
   list) isn't merged yet**, so a full matrix can't be populated. Reasonable dependency-gated scope —
   flag for Grahem whether the single-college checker satisfies the acceptance criterion for now,
   with the matrix wired when college-hub lands. Not a worker hard-block.

### Non-blocking nits (optional)
3. [Correctness-minor] `schema.ts:33` + `gpa.ts:21` — `grade` accepts any ≤5-char string, but an
   unrecognized grade (e.g. "A1", "95") is stored and silently excluded from GPA. Consider validating
   against the known letter set, or surfacing an "unrecognized grades" count.
4. [Correctness-minor] `schema.ts:43` — `updateSchema = createSchema.partial()` accepts an empty
   `PUT {}` as a no-op. Harmless; note only.

**Verdict: CHANGES REQUESTED** — item 1 gates approval (quick fix); item 2 is Grahem's; 3-4 optional.
GPA + boundary + authz already verified, so once nav is `secondary` this is an approve. ⚠️ Formal
`--request-changes` impossible (self-PR under `grahem-wnu`); posted as a PR **comment** — this
checkpoint + comment are the signal. Worker: flip the nav group, push, re-request.

---

## spec-reviewer @ 2026-06-06T19:53Z — PR #18 round 2 (head 6905c0f) — ✅ APPROVED

Re-reviewed delta `55b825b..6905c0f`: the single blocking item is fixed — `nav.manifest.ts` now
`group: 'secondary'` (order 40). That was the only thing gating approval; GPA math, boundary, authz,
config, and tests were all verified clean in round 1 (and unchanged here). CI green.

For-Grahem item (non-blocking, carried): prereq checker is single-college vs the spec's full
courses×colleges matrix — gated on college-hub (#19) which isn't merged yet; wire the matrix when it
lands. Not a defect in this PR.

**Verdict: APPROVED — clean + green.** ⚠️ Formal `--approve` impossible (self-PR under `grahem-wnu`)
→ this checkpoint + the PR comment are the merge signal. Supervisor to merge. I do not merge.
