# Foundational Spec — CI/CD

GitHub Actions does CI on PRs and deploys on merge. AWS auth via GitHub OIDC → the scoped deploy
role from CicdStack (no static keys). Workflows live in `.github/workflows/`. They are **staged in
`infra/github-workflows/`** in this kit (the authoring box blocks direct `.github/workflows/`
writes); the supervisor copies them into place at bootstrap.

## Workflows
1. **ci.yml** (on `pull_request` → `dev` or `main`): install, typecheck, lint, unit + integration
   tests, `cdk synth` (no deploy), and a guard that fails on duplicate route path+method across
   module manifests. Required check for merge.
2. **deploy-staging.yml** (on `push` to `dev`): assume the OIDC role (staging), `cdk deploy` backend
   stacks, build the frontend with staging SSM config, `aws s3 sync` to the staging bucket,
   CloudFront invalidation.
3. **deploy-prod.yml** (on `push` to `main`): same against prod stacks/bucket/distribution. `main`
   is only reached by Grahem's Gate-3 promotion PR, so prod deploy = manual promotion.

## Branch protection (supervisor sets at bootstrap)
- `dev`: require PR, require `ci` green, require spec-reviewer approval, allow supervisor (admin)
  merge. Worktree feature branches push freely; they land via PR.
- `main`: require PR + Grahem's approval. No direct pushes.

## Secrets / variables
- No AWS keys. OIDC role ARN comes from SSM/`CicdStack` output, referenced as a repo variable.
- `ANTHROPIC_API_KEY` repo secret ONLY if an agent step runs inside Actions; local worktree agents
  don't need it.

## Definition of done
All three workflows present and green on a trivial PR; OIDC assume-role works from Actions; a merge
to `dev` deploys to staging end to end; branch protection enforced.
