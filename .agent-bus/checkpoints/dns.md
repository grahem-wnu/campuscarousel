# dns — checkpoint

## infrastructure agent @ 2026-06-06 — DONE (PR #12, deployed + verified live, staging + prod)

Wires `keirasjourney.com` onto the CloudFront distributions. Branch `feat/dns` off dev → **PR #12**
into dev. Account confirmed `010928187255`/us-east-2 (+ us-east-1 for the cert) before every deploy.

**Domain:** registered via Route53 Domains 2026-06-06, locked (clientTransferProhibited), auto-renew on,
expires 2027. Pre-existing authoritative public hosted zone **Z03683613MXDVX9D5VIUV** (NS match the
registry) → DnsStack **imports** it (`dnsMode: import`), does NOT create a new zone.

**Implementation (PR #12):**
- `cdk.json`: both envs `defer → import`; add `hostedZoneId` context.
- `bin/infra.ts`: DnsStack pinned to **us-east-1** (CloudFront cert requirement) + `crossRegionReferences:true`
  on DnsStack & WebStack so the us-east-2 distribution consumes the us-east-1 ACM cert.
- `web-stack.ts`: added AAAA (IPv6) alias beside the A record.
- **Bootstrapped CDK in us-east-1** (`aws://010928187255/us-east-1`) — was missing; required for the cert.

**Deployed (Dns + Web per env only — Api/Async left untouched so the backend-bundle Api deploy stays live):**
- `KeirasJourney-Dns-staging` (us-east-1) + `KeirasJourney-Web-staging` (us-east-2) ✅
- `KeirasJourney-Dns-prod` (us-east-1) + `KeirasJourney-Web-prod` (us-east-2) ✅

**Live verification:**
- `https://staging.keirasjourney.com` → **HTTP 200**, TLS verify OK (`ssl_verify_result=0`); `http://` → **301**.
- `https://keirasjourney.com` → valid TLS + **301** http→https; **403** body ONLY because the prod SPA bucket
  is empty (0 objects vs staging's 10) — prod content publishes on the Gate-3 dev→main promotion. DNS/TLS/
  CloudFront wiring is correct.
- Cert (us-east-1): CN `keirasjourney.com`, SAN `*.keirasjourney.com`; ACM auto-managed the shared validation
  CNAME `_4cfb78b264ec2f4afe89d8afc0070957.keirasjourney.com` (same domain → reused across both env certs, no
  collision). A + AAAA alias records created. SSM `siteUrl` set: staging=https://staging.keirasjourney.com,
  prod=https://keirasjourney.com.

**Hostname → env map:** `staging.keirasjourney.com` = staging; apex `keirasjourney.com` = prod.

**⚠️ For the supervisor:**
1. **Merge PR #10 (backend-bundle) BEFORE PR #12.** A dev push runs `cdk deploy --all`; without #10 on dev the
   Api stack would redeploy the inline placeholder. #10 first → dev carries fromAsset Api + the CI build step.
2. **Pre-existing cicd risk (not in #12 scope):** `deploy:staging`/`:prod` run `cdk deploy --all` and
   `bin/infra.ts` builds BOTH staging+prod stacks, so a dev push can also touch prod stacks. Recommend the
   cicd unit scope deploys to per-env stacks (e.g. `KeirasJourney-*-<stage>` + global Cicd). DNS activation
   makes this more impactful (prod Dns/Web would deploy from dev).
3. CI deploy role can assume the new us-east-1 bootstrap roles (assumes `role/cdk-*`, region-agnostic IAM ARN) — no CicdStack change needed.

I do not merge — PR #12 ready for spec-reviewer → supervisor.
