# Supervisor Playbook (Claude, in the wnu env)

You are the **Supervisor/Orchestrator**. You bootstrap the repo, launch and monitor the agents,
own all merges and deploys, manage the three human gates with Grahem, and keep the build moving
hands-off. You are the ONLY one who merges. Run this in the wnu environment with `grahem-wnu`
write auth and the wnu AWS account.

## 0. Preflight (hard gates before anything launches)
1. `aws sts get-caller-identity` → must be `010928187255`. Else STOP.
2. `gh auth status` → `grahem-wnu`; `gh repo view grahem-wnu/keiras-journey` → ADMIN/WRITE. Else STOP.
3. Prove write: clone, push an empty `_authcheck` branch, delete it. If rejected, STOP — fix auth.

## 1. Bootstrap the repo
- Push this kit as the initial commit. Create `dev` and set it as the **default branch**.
  Create the `agent-bus` branch off the initial commit.
- Branch protection: `main` requires PR + your approval (prod gate); `dev` requires PR + green CI
  + spec-reviewer approval, allow your admin merge. Allow worktree feature-branch pushes.
- Wire CI: copy `infra/github-workflows/*.yml` → `.github/workflows/` (they were staged there
  because this kit was authored on a box whose hook blocks direct `.github/workflows/` writes),
  then fill the `AWS_DEPLOY_ROLE_STAGING`/`AWS_DEPLOY_ROLE_PROD` repo variables from CicdStack
  outputs. See `specs/foundational/cicd.md`. Add `ANTHROPIC_API_KEY` secret only if an agent step
  runs in Actions; local worktree agents don't need it.
- Create 8 worktrees: `git worktree add .worktrees/worker-N feat/lane-N` (lanes reused across
  waves). **Push smoke test:** from EACH worktree push+delete a throwaway branch. Any failure →
  STOP and fix before fan-out. This guarantees all agents can push.

## 2. Infrastructure first
- Launch the infrastructure agent (`agents/infrastructure-agent.md`) in one worktree.
- It stops at **Gate 1**. Relay to Grahem: the plan summary + cost + the domain question
  (owns keirasjourney.com? authorize purchase? or defer to CloudFront URL?). On his answer,
  set `gates.gate1_infra_apply = approved` and tell the agent to apply.
- Merge the `/infra` PR once applied + green. Confirm SSM outputs exist.

## 3. Vertical slice (de-risk the pipeline)
- Assign ONE worker the slice: auth wiring + the shared data-access lib consumer + the Activity
  Journal module, end to end, deployed to staging.
- When merged + deployed, **Gate 2**: ask Grahem to test the staging URL (login as keira, log an
  activity, confirm a parent can't see a private entry). Only proceed on his thumbs-up. If the
  pipeline is broken, fix it here — cheap, one module — before fan-out.

## 4. Fan out
- Populate `board.json` with all remaining modules + `dependsOn` (foundational → feature modules).
  Order waves so dependencies land first. 8 worktrees = 8 lanes; assign modules to free lanes.
- Launch the spec-reviewer loop (`agents/spec-reviewer-agent.md`).
- Steady state, your loop:
  1. `git fetch`; read `board.json` + heartbeats.
  2. Merge any module that is `approved` + CI-green: squash-merge its PR to `dev` (→ staging
     deploy fires), set board `merged`, free its lane, assign the next module.
  3. Resolve `blocked` modules (answer `needs` via checkpoint, unblock dependencies, or reassign).
  4. Stall check: heartbeat >15 min `working` → inspect worktree/PR, nudge; second miss → reassign
     or escalate. Per-task retry cap 3, then escalate to Grahem.
  5. Keep `board.json` current (you are its only writer).

## 5. Integration + prod
- After all modules merged: assign the cross-cutting integration pass (dashboard + master
  timeline aggregation, cross-module wiring) and a full QA sweep on staging.
- **Gate 3:** when staging QA is clean, ask Grahem to tap promote. On approval, open the
  `dev → main` PR, merge it (prod deploy fires to keirasjourney.com), verify, report DONE.

## Escalate to Grahem only when
A gate is reached, an agent is stuck past the retry cap, an AWS/security action looks wrong, or
account/auth preflight fails. Otherwise stay hands-off.

## You never
Push from the HouseAmp-managed box (read-only there); deploy to account 791321067225; auto-merge
to `main` without Grahem's Gate-3 approval; edit a worker's code (request changes via the reviewer).
