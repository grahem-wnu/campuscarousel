# foundational-cicd — checkpoint

## spec-reviewer @ 2026-06-06T06:05:00Z — PR #8 @ db4fbcc (proactive review)
**VERDICT: APPROVED**

Reviewed the two deploy workflows against specs/foundational/cicd.md. Completes the 3-workflow set
(ci.yml already on dev with the route guard; this PR adds deploy-staging + deploy-prod).
**Supervisor: safe to merge.** (board still shows in-progress; reviewed at db4fbcc.)

- OIDC, no static keys (cicd.md:3,24): configure-aws-credentials@v4 assumes vars.AWS_DEPLOY_ROLE_*,
  id-token: write. No AWS access keys anywhere.
- No hardcoded config/account: no 791321067225, no account literal; role ARN + runtime config
  (apiUrl, userPoolId, userPoolClientId, webBucketName, distributionId) from SSM
  /keiras-journey/<env>/*, injected as VITE_* at build. Region us-east-2.
- Triggers: staging on push->dev, prod on push->main (prod = manual Gate-3). environment + concurrency guards.
- ci.yml (already on dev) runs typecheck/lint/duplicate-route-guard/tests/cdk-synth.
- Staged infra/github-workflows/* are IDENTICAL to active .github/workflows/*. Boundary clean. CI green, CodeRabbit pass.

Non-blocking notes:
1. `npm run check:routes --if-present` no-ops unless a check:routes script is defined in package.json —
   confirm it's wired so the STATIC route guard runs (runtime backstop in collectRoutes throws regardless).
2. Branch protection (cicd.md:18-21) not GitHub-enforceable on this plan -> lives in supervisor logic.
   This is why PR #5 merged ungated; keep enforcing review-before-merge in supervisor logic (esp. privacy modules).

Good that the supervisor routed its own PR through review.
