# Foundational Spec — Infrastructure (CDK)

Canonical infra contract. The infrastructure agent (`agents/infrastructure-agent.md`) implements
this. AWS account = wnu `010928187255`, region `us-east-2`. Two environments: `staging`, `prod`.

## Stacks (CDK v2, TypeScript, `/infra`)
- **DataStack** — DynamoDB single table (keys/GSIs per `data-layer.md`), on-demand, PITR.
- **AuthStack** — Cognito (username-only, email-less, no self-signup), app client, 3 pre-created
  users with `custom:role`, NEW_PASSWORD_REQUIRED, suppressed emails. (See `auth.md`.)
- **ApiStack** — API Gateway HTTP API + Cognito JWT authorizer, routing Lambda (Node 20). Hydration
  Lambdas 300s timeout; CRUD default. Lambda role: DynamoDB CRUD on the table, `bedrock:InvokeModel`
  + `...WithResponseStream`, SQS send, SSM read. (See `api.md`.)
- **AsyncStack** — SQS hydration queue + DLQ; consumer Lambda processes one message at a time.
- **WebStack** — S3 (private) + CloudFront (OAC), one distribution per env; SPA fallback to index.html.
- **DnsStack** (Gate 1) — Route53 hosted zone + ACM cert for `keirasjourney.com`; import if owned,
  register if authorized, else defer to the CloudFront default domain.
- **CicdStack** — GitHub OIDC provider + a deploy role trust-scoped to `grahem-wnu/keiras-journey`
  (branch conditions: `dev` → staging, `main` → prod). Least-privilege deploy policy.
- **Observability** — CloudWatch log groups; an AWS Budgets alarm on the account.

## Config flow (no hardcoding)
Every output (table name, pool/client ids, API URL, bucket names, distribution ids, queue url,
OIDC role ARN, model id) → SSM under `/keiras-journey/<env>/...`. Lambdas read from env vars CDK
injects from SSM. The frontend build reads public config (pool id, client id, API URL) at build
time from SSM via the deploy workflow.

## Security baseline
- S3 buckets private; access only via CloudFront OAC.
- IAM least-privilege per Lambda; no wildcard resource on the table/queue.
- No long-lived AWS keys anywhere (CI uses OIDC; local agents use the scoped wnu profile).
- Cognito email-less; admin-only password reset.
- Budget alarm to catch runaway Bedrock/compute during the autonomous build.

## Gate 1
After `cdk synth`, the agent writes a plain-language plan + monthly cost estimate to
`.agent-bus/checkpoints/infra.md` and STOPS. The supervisor relays Grahem's approval + the domain
decision, then the agent applies (staging first, then prod) and publishes SSM outputs.
