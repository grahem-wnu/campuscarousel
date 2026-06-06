# Infrastructure checkpoint

**Agent:** infrastructure · **Branch:** feat/infra · **Updated:** 2026-06-06T04:03:46Z
**Status:** 🟡 BLOCKED on AWS credentials — IaC complete & synth-clean; deploy + domain not run.

---

## TL;DR
The full CDK app is authored and `cdk synth` is **CLEAN (exit 0, 13 stacks, staging + prod)**,
committed and pushed to `feat/infra`. I am **authorized** for full-auto deploy + domain purchase,
but I **cannot proceed** because there are **no usable credentials for the wnu account
`010928187255`**, and the only live credentials resolve to the **forbidden account
`791321067225`**. Per the account guard I refused to touch it. Need wnu credentials to continue.

## ⛔ Blocker (action needed)
- `aws sts get-caller-identity --profile wnu` → **"Unable to locate credentials."**
- `~/.aws/config` `[profile wnu]` has a **region only** — no access keys, no SSO, no role.
- Default profile → Account **791321067225** (forbidden). `houseamp-dev` → also forbidden.
- **Remediation:** configure the `wnu` profile to authenticate as `010928187255` — e.g.
  `aws configure sso --profile wnu` then `! aws sso login --profile wnu`, **or** add `[wnu]`
  keys to the credentials file. Verify with `aws sts get-caller-identity --profile wnu`
  (must show Account `010928187255`). Then deploy + domain registration run autonomously.

No mutating AWS calls were made. Only read-only identity/config checks ran.

## What will be created (13 stacks — `cdk synth` clean)
**Account-global (once):**
- **KeirasJourney-Cicd** — GitHub OIDC provider; two scoped deploy roles
  (`keiras-journey-deploy-staging` ← branch `dev`, `keiras-journey-deploy-prod` ← branch `main`),
  each able only to assume this account's `cdk-*` bootstrap roles (no broad admin); AWS Budgets
  alarm ($75/mo, 80% actual + 100% forecast) → SNS topic.

**Per environment (staging + prod):**
- **Data** — one DynamoDB table, on-demand, **PITR on**, AWS-managed encryption, GSI1–GSI4
  (date / category / facility / TEAS) per `data-layer.md`. prod: deletion protection + RETAIN.
- **Auth** — Cognito pool: **username-only, no email, no self-signup**, `AccountRecovery.NONE`
  (admin-only reset), `custom:role`; 3 pre-created users (grahem/admin, kate/parent,
  keira/student) with temp passwords → `NEW_PASSWORD_REQUIRED`, welcome emails SUPPRESSED;
  no-secret SPA app client (SRP + USER_PASSWORD).
- **Async** — SQS hydration queue (+DLQ, maxReceiveCount 3); Node 20 worker, **300s** timeout,
  **batchSize 1** (Bedrock throttle safety), DynamoDB RW + Bedrock invoke.
- **Api** — API Gateway **HTTP API** + **Cognito JWT authorizer** (default on all routes,
  `ANY /{proxy+}`); Node 20 routing Lambda (default 30s timeout; enqueues hydration to SQS);
  least-privilege role: table RW, SQS send, Bedrock invoke, env SSM read; CORS for the env host
  + localhost.
- **Web** — **private** S3 bucket (BLOCK_ALL public) behind **CloudFront OAC**, TLS 1.2_2021,
  SPA fallback (403/404→/index.html), PriceClass 100. Custom domain wired only when DNS is active.
- **Observability** — per-env app log group + Lambda error/throttle + API 5xx alarms + dashboard.

**DnsStack** — present but a **no-op** under the default `dnsMode: "defer"`; activates (Route53
zone import/create + ACM cert) once the domain is registered. (NOTE: CloudFront certs must be in
us-east-1 — documented in `dns-stack.ts`; handled at deploy.)

All outputs (table name, pool/client ids, API url, bucket/distribution ids, queue urls, OIDC +
deploy-role ARNs, hosted-zone id) are written to **SSM** under `/keiras-journey/<env>/...` and
`/keiras-journey/global/...` at deploy time. **Zero literal account ids / table / pool / client /
model ids / ARNs in source** — account/region/model come from cdk.json context or creds.

## Bedrock inference profile
- Chosen (parameterized via cdk.json `bedrockSonnetProfile`):
  **`us.anthropic.claude-sonnet-4-20250514-v1:0`** (from the master spec).
- ⚠️ Could **not** verify against `aws bedrock list-inference-profiles --profile wnu` (no creds).
  Confirm / upgrade to the latest `us.anthropic.claude-sonnet-4-*` profile at deploy — it's a
  context value, swappable with no code change.

## Itemized estimated monthly cost (light family use, staging + prod)
| Service | Est. / month |
|---|---|
| DynamoDB (on-demand + PITR) | $1–2 |
| Cognito (3 users) | $0 (free tier) |
| Lambda (routing + worker) | $0–1 (free tier) |
| API Gateway HTTP API | $0–1 |
| SQS + DLQ | $0 (free tier) |
| S3 (2 SPA buckets) | ~$0.05 |
| CloudFront (2 dists, PriceClass 100) | $1–2 |
| Route53 hosted zone (when domain active) | $0.50 |
| ACM certificate | $0 |
| CloudWatch (alarms + logs + dashboards) | $1–2 |
| AWS Budgets (first 2 free) | $0 |
| SNS | ~$0 |
| **Infra subtotal** | **~$5–9 / mo** |
| Bedrock Claude Sonnet (AI features) | **$10–30 / mo** (usage-driven) |
| **Total** | **~$15–39 / mo** |
| Domain `keirasjourney.com` (.com registration) | **~$13–15 / yr** (≤ $20/yr cap ✓) |

Budget alarm at $75/mo leaves comfortable headroom.

## Domain
Authorized to buy `keirasjourney.com` autonomously up to $20/yr. **Not yet run** (blocked on
wnu creds). On creds: `route53domains check-domain-availability` → if available and `.com` price
≤ $20/yr, register with WHOIS privacy + auto-renew ON using the SSM SecureString
`/keiras-journey/domain/registrant` for all three contacts (will ask operator if that param is
absent). Registration auto-creates the hosted zone → DnsStack imports it.

## Evidence
- `cdk synth` exit 0; 13 stacks in `cdk.out/manifest.json` (Cicd + Data/Auth/Async/Api/Web/
  Observability × staging+prod). `tsc --noEmit` clean.
- Pushed: `feat/infra` @ `66d9f59`.
- `get-caller-identity`: default = 791321067225 (forbidden, untouched); wnu = no creds.

## Next (once wnu creds exist)
1. Re-run guard → confirm `010928187255`.
2. Verify Bedrock profile; `cdk bootstrap` (if needed); `cdk deploy` staging → smoke → prod.
3. Register domain (≤$20/yr); activate DnsStack.
4. Write SSM outputs; prove a test login returns a JWT the authorizer accepts.
5. Open the `/infra` PR into `dev` for the supervisor (gate1 already approved).
