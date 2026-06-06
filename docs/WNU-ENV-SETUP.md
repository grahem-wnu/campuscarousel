# wnu Environment Setup — Runbook

This build is **write-heavy** (pushes branches, opens/merges PRs, sets Actions secrets,
configures branch protection, provisions AWS). It must run in a **We Need U Health
environment**, not the HouseAmp-managed box. This file tells you how to stand that up and
kick off the build hands-off.

## Why a different environment
The HouseAmp-managed machine restricts `grahem-wnu/*` to **read-only** gh and carries
HouseAmp guardrails (git identity `grahem@houseamp.com`, prod-DB write blocks). It cannot
push or merge to `grahem-wnu/keiras-journey`. The wnu environment must have:
- GitHub authenticated as **grahem-wnu** with **write/admin** on `grahem-wnu/keiras-journey`.
- AWS authenticated as the **wnu account `010928187255`** with permissions to run CDK
  (CloudFormation, IAM, Cognito, DynamoDB, Lambda, API Gateway, SQS, S3, CloudFront,
  Route53, ACM, SSM).
- **No** HouseAmp guardrail settings.json (a clean `~/.claude` for this project).

## Where the build kit lives
Everything is in `/mnt/c/Keira/keiras-journey/` (this folder). If the wnu environment is on
this same Windows machine, the files are already reachable. If it's a different machine, copy
the whole folder over. This folder becomes the repo root.

## CRITICAL — write access for the supervisor AND all 8 agents
Non-negotiable: the supervisor and every worktree agent must be able to push to
`grahem-wnu/keiras-journey`. The whole orchestration (branches, PRs, merges) collapses if any
agent can't push. We guarantee this with **one** auth, shared by all worktrees:

1. Authenticate gh **once** as `grahem-wnu` in the wnu env. This installs the git credential
   helper `gh auth git-credential` for github.com.
2. Clone the repo once. All 8 worktrees are created from this clone with `git worktree add`,
   so they **share the same `.git` config and credential helper** — every worktree pushes as
   `grahem-wnu` with zero per-agent credential setup.
3. The supervisor (Claude, in this env) merges via `gh` with the same `grahem-wnu` admin auth.
4. Branch protection must allow `grahem-wnu` (admin) to merge to `dev`/`main` and allow feature
   branch pushes from the worktrees.

**Push smoke test (the supervisor runs this before fan-out — a hard gate):** from each of the
8 worktrees, push a throwaway branch and delete it. If any worktree fails, STOP and fix auth
before launching workers. (Mechanics in `agents/supervisor-playbook.md`.)

## Step 1 — Verify GitHub write
```bash
gh auth status                       # expect: logged in as grahem-wnu
gh repo view grahem-wnu/keiras-journey --json nameWithOwner,viewerPermission
# viewerPermission must be ADMIN or WRITE
# Prove an actual push works (not just read):
git clone https://github.com/grahem-wnu/keiras-journey && cd keiras-journey
git checkout -b _authcheck && git commit --allow-empty -m "auth check" && git push -u origin _authcheck
git push origin --delete _authcheck && git checkout - 2>/dev/null || true
```
If it shows the wrong account, `gh auth login` as grahem-wnu (or `gh auth switch` on gh ≥ 2.40).
If the push is rejected, you do NOT have write — resolve before going further (collaborator/role,
or correct credential).

## Step 2 — Verify AWS is the wnu account
```bash
aws sts get-caller-identity          # expect Account 010928187255, user/Grahem
```
If not, set the profile (`export AWS_PROFILE=wnu`) or configure the wnu credentials. Region
is `us-east-2`.

## Step 3 — Tooling check
```bash
node --version                       # ≥ 20 (22 is fine)
npm i -g aws-cdk && cdk --version    # CDK v2
gh --version                         # ≥ 2.40 preferred (for auth switch)
```

## Step 4 — Decisions to have ready (the three gates)
1. **Domain.** Do you already own `keirasjourney.com`? If yes, the infra agent uses it. If no,
   you authorize a Route53 purchase at Gate 1. (Repo is `keiras-journey`, domain is
   `keirasjourney.com` — intentional.)
2. **Anthropic API key** — only needed if any agent step runs *inside* GitHub Actions. With
   local worktree agents it is not required for the build itself. Have one ready as a repo
   secret (`ANTHROPIC_API_KEY`) in case.
3. **Prod promotion** is your manual tap at the end — nothing to prep.

## Step 5 — Kick off (hands-off from here)
In the wnu Claude environment, open this folder and say: **"Run the bootstrap."** The
supervisor will:
1. Bootstrap the repo: create `dev` (default), push the scaffold, set branch protection on
   `dev` + `main`, wire CI. (`agents/supervisor-playbook.md`)
2. Launch the **infrastructure agent** (`agents/infrastructure-agent.md`) → it synthesizes the
   CDK plan and **STOPS at Gate 1** for your approval + domain confirmation.
3. After apply: build the **vertical slice** (auth + Activity Journal) → deploy to staging →
   **STOP at Gate 2** for you to test.
4. Fan out **8 worktree workers** across the remaining modules; the spec-reviewer loop runs;
   the supervisor merges green+approved PRs → staging deploys accrue.
5. Integration + QA → **STOP at Gate 3**: you tap promote → prod deploy to the live domain.

## What you do during the run
Nothing, except answer the three gates. The supervisor monitors `.agent-bus`, reviews, merges,
and escalates only when blocked or at a gate. See `agents/supervisor-playbook.md` and
`.agent-bus/README.md` for the mechanics.
