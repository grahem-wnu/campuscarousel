# .agent-bus — State Management & Message Bus

How the autonomous agents coordinate. GitHub is the bus. This directory is the shared state.
The design goal is **zero merge conflicts on the bus itself**: every writer owns distinct
files, and the one aggregate file has a single writer.

> **The loop:** `STATE-MACHINE.md` defines the wave engine, milestone checks (M0–M7), the three
> human gates, and each role's poll→act→write-back→push loop. It is the *rules*; `board.json` is
> the *live state* it operates on. Read `STATE-MACHINE.md` first.

## Channels
1. **`board.json`** — the aggregate task board. **Single writer: the supervisor.** Everyone
   else reads it. No one but the supervisor commits it, so it never conflicts.
2. **`agents/<agentId>.json`** — one heartbeat file per agent. **Each agent writes only its
   own file.** Distinct paths → no conflicts.
3. **`checkpoints/<moduleId>.md`** — the worker↔reviewer thread for one module. Written by that
   module's worker and the spec-reviewer only.
4. **PR comments** — the spec-reviewer's findings land as inline PR comments too (human-readable,
   and what the supervisor's merge gate reads).

## Branch model for the bus
A dedicated long-lived branch **`agent-bus`** holds this directory's live state, separate from
code branches so status churn never touches `dev`. Protocol for every bus write:
```bash
git fetch origin agent-bus
git rebase origin/agent-bus        # bus files are owner-partitioned, so this is conflict-free
# write ONLY your own file(s)
git add .agent-bus/agents/<me>.json     # or your checkpoints/<module>.md
git commit -m "bus: <me> heartbeat <status>"
git push origin HEAD:agent-bus
```
Workers update their heartbeat at: task start, every meaningful step, on block, on PR open, on
PR merged. If a push races, re-fetch/rebase and retry (the files don't overlap).

## board.json schema
```json
{
  "updatedAt": "ISO-8601",
  "phase": "bootstrap | infra | slice | fanout | integration | prod",
  "gates": {
    "gate1_infra_apply": "pending | approved",
    "gate2_slice_test": "pending | approved",
    "gate3_prod_promote": "pending | approved"
  },
  "modules": [
    {
      "id": "activity-journal",
      "spec": "specs/modules/activity-journal.md",
      "owner": "worker-3",
      "worktree": ".worktrees/worker-3",
      "branch": "feat/activity-journal",
      "pr": 42,
      "status": "todo | in-progress | review | changes-requested | approved | merged | blocked",
      "dependsOn": ["foundational-data-layer", "foundational-auth"],
      "blockedReason": ""
    }
  ]
}
```

## agents/<agentId>.json (heartbeat) schema
```json
{
  "agentId": "worker-3",
  "role": "infrastructure | worker | spec-reviewer | supervisor",
  "updatedAt": "ISO-8601",
  "currentTask": "implement activity-journal backend handlers",
  "status": "idle | working | waiting-review | blocked | done",
  "branch": "feat/activity-journal",
  "pr": 42,
  "blockers": [],
  "needs": "free-text: what this agent needs from supervisor/reviewer to proceed"
}
```

## Status lifecycle (per module)
```
todo → in-progress → review → (changes-requested → review)* → approved → merged
                        ↘ blocked ↗ (any time; supervisor resolves or escalates)
```
- **Worker** moves todo→in-progress (claims), opens PR → review.
- **Spec-reviewer** sets review→changes-requested or review→approved (via checkpoint + PR review).
- **Supervisor** is the ONLY one who merges (approved→merged), then updates board.json.

## Heartbeat / liveness
The supervisor treats a heartbeat older than **15 minutes** with status `working` as a possible
stall: it inspects the worktree/PR, nudges via the checkpoint file, and after a second miss
reassigns the module or escalates to Grahem. Per-task retry cap: **3**, then escalate.

## Who writes what (ownership table)
| File                          | Writer(s)                         |
|-------------------------------|-----------------------------------|
| `board.json`                  | supervisor only                   |
| `agents/supervisor.json`      | supervisor                        |
| `agents/spec-reviewer.json`   | spec-reviewer                     |
| `agents/infrastructure.json`  | infrastructure agent              |
| `agents/worker-N.json`        | worker-N only                     |
| `checkpoints/<module>.md`     | that module's worker + reviewer   |

This partitioning is what keeps the bus conflict-free under 8 concurrent agents.
