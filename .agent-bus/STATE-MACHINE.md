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

## Per-role loops (poll → act → write-back → push)

All loops share the bus write protocol from `README.md`:
`git fetch origin agent-bus && git rebase origin/agent-bus` → write **only your own files** →
commit → `git push origin HEAD:agent-bus` (retry on race; owner-partitioned files don't collide).

### Worker (each of 8 lanes)
1. Read `board.json`. Find the module assigned to me (`owner == me`, `status in {todo, changes-requested}`).
   If none, write heartbeat `idle` and sleep.
2. Claim: heartbeat `working`; (supervisor sets module `in-progress` on assignment).
3. Implement within my paths only (`backend/modules/<m>/`, `frontend/src/modules/<m>/`,
   `specs/<m>.md`, append-only manifest). Run `plan-eng-review` + `code-review` skills.
4. Open/refresh PR into `dev`. Heartbeat `waiting-review`, set `pr`. Append to
   `checkpoints/<m>.md`: "PR #N ready, summary …".
5. On `changes-requested`: address reviewer notes, push, heartbeat `working` → `waiting-review`.
6. Heartbeat at: task start, each meaningful step, on block, PR open, after addressing review.
   Stuck → heartbeat `blocked` + `needs:` text; supervisor resolves or reassigns.

### Spec-reviewer (loop, own worktree)
1. Read `board.json`. For each module `status: review` with an open PR I haven't reviewed at HEAD:
2. Run `spec-review` + `qa-review` against the PR diff and the module spec.
3. Post findings as **inline PR comments** + append verdict to `checkpoints/<m>.md`.
4. Submit a PR review: approve → tell supervisor (checkpoint) to flip `review → approved`;
   else request changes → supervisor flips `review → changes-requested`.
   (Reviewer signals via checkpoint/PR; **only the supervisor mutates `board.json`**.)
5. Heartbeat each pass. Idle when nothing in `review`.

### Supervisor (the only board writer + only merger)
1. `git fetch`; read `board.json` + all heartbeats + open PRs.
2. **Merge:** any module `approved` + CI-green → squash-merge PR to `dev` (fires staging deploy),
   set `merged`, free its lane.
3. **Assign:** for each free lane, pick the lowest-wave **eligible** module (`dependsOn` all
   `merged`), set `owner`/`branch`/`worktree`/`status: in-progress`, notify via checkpoint.
4. **Reviewer signals:** apply approve/changes-requested verdicts to module `status`.
5. **Unblock:** resolve `blocked` modules (answer `needs`, land their dependency, or reassign).
6. **Stall:** heartbeat >15 min `working` → inspect/nudge; 2nd miss → reassign. Retry cap 3 → escalate.
7. **Milestones/phase:** when a milestone's criteria hold, flip it `done`; advance `phase` per the
   table above. At any `gate*: pending`, **stop and escalate to Grahem**; resume on `approved`.
8. Write `board.json`, push. Sleep, loop.

### Infrastructure agent (one pass, gated)
1. Synthesize CDK (`cdk synth`), open `/infra` PR. Heartbeat `waiting-review`, append plan +
   cost summary + the domain question to `checkpoints/foundational-infra.md`. **Stop at Gate 1.**
2. On `gates.gate1_infra_apply == approved`: `cdk deploy`, write outputs to SSM, heartbeat `done`.

---

## Invariants (do not violate)
- **One writer per file.** `board.json` = supervisor only. Heartbeats/checkpoints = their owner.
- **Eligibility gates work**, not wave numbers. Never assign a module whose `dependsOn` aren't `merged`.
- **Gates are Grahem's.** No auto-advance past a `pending` gate; no auto-merge to `main`.
- **wnu only.** Every AWS action targets `010928187255` / us-east-2. Never `791321067225`.
- **Bus churn stays on `agent-bus`**, never on `dev`/`main`.
