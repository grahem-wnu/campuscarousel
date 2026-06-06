# Infrastructure checkpoint

**Agent:** infrastructure · **Branch:** feat/infra · **Updated:** 2026-06-06T04:48:51Z
**Status:** 🟢 DEPLOYED — all 13 stacks live in wnu (`010928187255`) us-east-2, staging + prod.
Auth flow proven end-to-end. PR #2 open. Only the domain is outstanding (needs operator contact).

---

## TL;DR
Full AWS stack **deployed and verified** in both environments. A real Cognito login returns a JWT
the API authorizer accepts; unauthenticated requests are rejected. All outputs are in SSM. The one
remaining step is registering `keirasjourney.com` — blocked only on the WHOIS registrant contact
(SSM param `/keiras-journey/domain/registrant` doesn't exist, so I need the fields from the
operator; I will not invent them).

## Deployed stacks (13 — all CREATE_COMPLETE)
- **KeirasJourney-Cicd** (global) — imported existing GitHub OIDC provider; deploy roles
  `keiras-journey-deploy-staging` (branch `dev`) + `keiras-journey-deploy-prod` (branch `main`),
  each scoped to assume only `cdk-*` roles; account Budgets alarm ($75/mo) + SNS topic.
- **Data / Auth / Async / Api / Web / Observability** × **staging** and **prod**.

## Verification evidence
- `aws sts get-caller-identity` (wnu) = **Account 010928187255** ✓ (guard run before every mutation).
- CloudFormation: 13/13 `CREATE_COMPLETE`, no rollbacks.
- **Auth (staging + prod):** `initiate-auth` → `NEW_PASSWORD_REQUIRED`; challenge response → IdToken
  (JWT) containing `custom:role` (verified `student` for keira). API: **no-token → 401**,
  **bad-token → 401**, **valid JWT → 503** (authorizer accepts; 503 is the placeholder Lambda).
- Cognito: 3 users per pool (grahem/admin, kate/parent, keira/student), all
  `FORCE_CHANGE_PASSWORD` (temp password set out-of-band → `NEW_PASSWORD_REQUIRED` on first login).
- S3 buckets private (BlockPublicAccess all-true) behind CloudFront OAC; sites live on the
  CloudFront default domains (below).

## Key SSM outputs (`/keiras-journey/...`)
**staging:** userPoolId `us-east-2_xpFg5wuoD`, clientId `2a2q6130jrik7tceik5077k22`,
apiUrl `https://y73no652r1.execute-api.us-east-2.amazonaws.com`,
web `https://dfdy4khr9wq7r.cloudfront.net`, table `KeirasJourney-Data-staging-AppTable...`.
**prod:** userPoolId `us-east-2_GHoBLMiBd`, clientId `1glubpn2ht3hv9q24r6g26afvv`,
apiUrl `https://p44kr9j3l8.execute-api.us-east-2.amazonaws.com`,
web `https://d2bgcyqjtel7ok.cloudfront.net`.
**global:** OIDC ARN, deployRoleArn-staging/-prod, budgetTopicArn — all under
`/keiras-journey/global/cicd/...`. Workers can self-configure from SSM.

## Bedrock
Inference profile **`us.anthropic.claude-sonnet-4-6`** (verified ACTIVE via
`aws bedrock list-inference-profiles`; latest Sonnet in us-east-2). Lambda roles have
`bedrock:InvokeModel` + `InvokeModelWithResponseStream` scoped to the profile + sonnet-4 models.

## Domain (the one open item)
`keirasjourney.com` is **AVAILABLE at $15.00/yr** (≤ $20 cap, confirmed via route53domains).
Registration is ready to run autonomously the moment the registrant contact is provided
(WHOIS privacy ON + auto-renew ON). Registration auto-creates the Route53 hosted zone; then
DnsStack imports it and a us-east-1 ACM cert is wired to the prod CloudFront distribution
(currently serving on the default *.cloudfront.net domain). Until then the app is fully usable
on the CloudFront URLs above.

## Cost (light family use)
Infra ~$5–9/mo + Bedrock $10–30/mo ≈ **$15–39/mo**; domain ~$15/yr. Budget alarm at $75/mo.

## Remaining
1. (Operator) provide domain registrant contact → I register `keirasjourney.com` + wire DnsStack.
2. Supervisor merges PR #2 (Gate 1 pre-approved).
3. Real Lambda handlers ship from `backend/` later (placeholders return 503 today).
