# STATE-MACHINE — wave engine & milestone checks

This is the **milestone check file**: the static rules that turn `board.json` into a loop the
agents drive themselves. `board.json` holds the *live state*; this file holds the *transition
rules*. GitHub is the bus — every agent `git fetch`es the `agent-bus` branch, reads `board.json`
+ its own checkpoint, acts, writes back **only its own files**, and pushes. No central clock:
each role runs its loop, and the board's state is the only coordination point.

- **Definitions (this file):** static. Committed once, changes only by deliberate edit.
- **Live state (`board.json`):** mutable. **Single writer: the supervisor** (see README).
- **Heartbeats (`agents/<id>.json`), checkpoints (`checkpoints/<module>.md`):** owner-partitioned.

---

## Phases (the outer state machine)

```
bootstrap ──► infra ──► slice ──► fanout ──► integration ──► prod ──► done
              (G1)      (G2)                                  (G3)
```

| Phase         | Entry condition                                  | Exit condition (→ next)                                   |
|---------------|--------------------------------------------------|----------------------------------------------------------|
| `bootstrap`   | repo-init started                                | M0 complete (kit on `dev`, `agent-bus` live, board seeded)|
| `infra`       | M0 complete                                      | **GATE 1** approved → infra applied, SSM outputs exist (M1)|
| `slice`       | M1 complete                                      | activity-journal merged + deployed + **GATE 2** approved (M2)|
| `fanout`      | M2 complete                                      | all wave-2/3/4 modules `merged` (M3–M5)                   |
| `integration` | all modules merged                               | cross-module wiring + full staging QA clean (M6)         |
| `prod`        | M6 complete                                      | **GATE 3** approved → `dev`→`main` merged + verified (M7)|
| `done`        | M7 complete                                      | —                                                        |

**Gates are human (Grahem).** The supervisor never advances past `gate*: pending`. The loop
stops at the gate and escalates; on `approved` it resumes automatically.

---

## Waves (the fanout DAG)

A module is **eligible** when every id in its `dependsOn` has `status: merged`. The supervisor
assigns eligible modules to free lanes (8 worktrees), lowest `wave` first. Waves are ordering
guidance derived from the dependency graph — eligibility (not wave number) is the hard rule.

| Wave | Purpose                  | Members |
|------|--------------------------|---------|
| 0    | Foundation (frozen contracts) | `foundational-infra` (Gate 1), then `foundational-data-layer`, `foundational-auth`, `foundational-api`, `foundational-design-system`, `foundational-cicd` |
| 1    | Vertical slice (Gate 2)  | `activity-journal` |
| 2    | Core, foundation-only deps | `why-nursing`, `clinical-hours`, `goal-tracker`, `certifications`, `course-planner`, `teas-prep`, `scholarship-tracker`, `college-hub`, `peer-benchmark` |
| 3    | Cross-module deps        | `application-central`, `campus-visit-planner`, `demonstrated-interest-contacts`, `interview-prep`, `ai-assistant` |
| 4    | Aggregators              | `dashboard`, `master-timeline` |

Every module also implicitly depends on all of wave 0. Wave 4 aggregators depend on the feature
modules they roll up (see each module's `dependsOn` in `board.json`).

---

## Milestones (what each phase checks for)

The supervisor flips `milestones[].status` `pending → done` when **criteria** hold. Criteria are
written to be checkable from the repo/PR/SSM state, not from vibes.

| id   | gate   | done when |
|------|--------|-----------|
| `M0` | —      | `dev` is default branch with the kit; `agent-bus` branch live with seeded `board.json`; 8 lanes push-smoke-tested |
| `M1` | Gate 1 | infra CDK applied to wnu `010928187255`/us-east-2; stack outputs written to SSM; `/infra` PR merged + CI green |
| `M2` | Gate 2 | `activity-journal` merged; staging deploy green; Grahem confirms login + private-entry visibility on staging |
| `M3` | —      | all wave-2 modules `merged` |
| `M4` | —      | all wave-3 modules `merged` |
| `M5` | —      | all wave-4 modules `merged` (→ all 17 modules merged) |
| `M6` | —      | integration pass merged; full staging QA sweep clean |
| `M7` | Gate 3 | `dev`→`main` merged; prod deploy to keirasjourney.com verified |

---

## Per-role loops — GitHub IS the queue

Operating model: **GitHub is the work queue, the lock, and the message bus.** Agents are launched
with the `/loop` skill so each pass re-checks state and acts (a bare prompt does one pass then
waits). `board.json` is the **supervisor-maintained** dependency graph + merged-status that workers
**read** to compute eligibility; workers never write it. Coordination primitives:
- **Claim = atomic branch-ref create.** `gh api -X POST repos/<repo>/git/refs -f ref=refs/heads/feat/<id> -f sha=<dev-sha>`. Succeeds once; returns **HTTP 422** to everyone else → no double-claim, no lock file, no board write.
- **State = PRs.** Draft PR = claimed/in-progress. Ready PR = up for review. Review decision + CI `statusCheckRollup` = the gate. Merge = done.

### Worker (identical; id = `basename $PWD`)
1. `git fetch`; read `board.json` via `git show origin/agent-bus:.agent-bus/board.json`. Eligible =
   not `foundational-infra`/`foundational-cicd`, board status ≠ `merged`, all `dependsOn` `merged`.
2. Claim the lowest-wave eligible unit via the atomic ref-create (422 → try the next).
3. Checkout `feat/<id>`, open a **draft PR** (claim is now visible), implement in owned paths only
   (`backend/modules/<m>/`, `frontend/src/modules/<m>/`, append-only route/nav manifests; for a
   foundational unit, only its package). Tests incl. the privacy test. `gh pr ready` when green locally.
4. Address reviewer `request-changes` rounds; push; let it re-review. Never merge.
5. After merge, loop to 1. Comms are GitHub only (commits, PRs, PR comments).

### Spec-reviewer (loop, own worktree)
1. `gh pr list --base dev --state open` → for each non-draft PR unreviewed at its head SHA:
2. Review diff vs spec: conformance, correctness, security, **privacy** (server-side off JWT),
   ownership boundaries, tests, no hardcoded config. Confirm CI green via `statusCheckRollup`.
3. Post inline findings; submit `gh pr review --approve` (clean + green) or `--request-changes`.
   The reviewer signals **through the PR review**; it never writes `board.json` and never merges.

### Supervisor (loop; the ONLY merger + the ONLY board writer)
1. `git fetch`; `gh pr list --base dev --state open --json number,headRefName,isDraft,reviewDecision,statusCheckRollup`.
2. **Merge** any non-draft PR that is `APPROVED` + CI-green + whose unit is not gate-blocked:
   `gh pr merge <n> --squash`. (`foundational-infra` waits for Gate 1; never merge to `main`.)
3. **Maintain `board.json`** on `agent-bus`: set merged units `merged`, reflect open PRs' owner/pr,
   flip milestones whose criteria hold, advance `phase`. Push `agent-bus`. This is what unlocks the
   next eligible units for the workers — so it must run every pass.
4. **Stall check:** a `feat/*` branch/PR with no commit/activity > ~15 min and not in review →
   comment a nudge; persistent → escalate to Grahem.
5. **Gates:** at any `gate*: pending`, do not advance — surface to Grahem and wait; resume on `approved`.

### Infrastructure agent (one pass, gated)
1. `cdk synth` clean; open a **draft** `/infra` PR whose body is the Gate-1 plan (resources +
   itemized cost + domain question). **Stop at Gate 1.** No deploy.
2. On Grahem's approval (told directly, or `gates.gate1_infra_apply == approved`): `cdk deploy`
   staging→prod, write outputs to SSM, mark the PR ready. Supervisor then merges it.

---

## Invariants (do not violate)
- **`board.json` is supervisor-written only.** Workers/reviewer read it; they never write it.
- **Claim is the atomic ref-create.** One winner per `feat/<id>`; 422 means already taken.
- **Eligibility gates work**, not wave numbers. Never claim a unit whose `dependsOn` aren't `merged`.
- **Only the supervisor merges**, and only `APPROVED` + CI-green units, only into `dev`.
- **Gates are Grahem's.** No auto-advance past a `pending` gate; no auto-merge to `main`.
- **wnu only.** Every AWS action targets `010928187255` / us-east-2. Never `791321067225`.
- **Stay in your lane.** Edit only your unit's owned paths; raise shared-file needs in the PR.
