# Keira's Journey — Project Guide for Claude

## What this is
A private, family-operated web app that tracks Keira's multi-year journey toward a BSN
(nursing) program. Three users: **grahem** (admin), **kate** (parent), **keira** (student).
AWS serverless backend, React frontend, AI (Bedrock/Claude) woven throughout.

**The product spec is the source of truth:** `spec/keirasjourney-spec.md` (v2.0, 17 modules).
Read it before building or changing behavior. If code and spec disagree, the spec wins unless
Grahem says otherwise. Behavior changes start in the spec, then the code.

## AWS — read this before running anything
- **Always use the `wnu` profile** (`--profile wnu`, or `export AWS_PROFILE=wnu`). This is the
  *We Need U Health* account and is the ONLY account this project touches.
- **Never deploy to or mutate the `default` or `houseamp-dev` profiles.** Those are unrelated
  accounts (`default` = account `791321067225`). A wrong-account deploy is the one mistake here
  that's genuinely hard to undo — confirm the account before every deploy.
- **Region: `us-east-2`** (the wnu profile's default). Bedrock Claude is reached via the
  cross-region inference profile (the `us.` prefix), which is valid from us-east-2.
- Sanity-check before any deploy: `aws sts get-caller-identity --profile wnu` — confirm it is the
  wnu account, **not** `791321067225`.
- Never print, echo, or commit credentials or secrets. Config goes in SSM Parameter Store or
  Lambda env vars — no hardcoded account IDs, table names, pool/client IDs, or model IDs.

## Architecture (from the spec — keep it this way)
- **Frontend:** React + Vite + Tailwind. No component library — keep dependencies light.
  Hosted on S3 + CloudFront. Auth via `@aws-amplify/auth` (v6+), username login (no email),
  tokens in memory only, handle the `NEW_PASSWORD_REQUIRED` first-login challenge.
- **Backend:** API Gateway **HTTP API** + Lambda (Node 20 / TypeScript). Cognito JWT authorizer
  validates tokens — no custom auth code.
- **Data:** a **single** DynamoDB table, on-demand, with the composite PK/SK and GSIs defined in
  the spec. Do not split into per-entity tables.
- **Auth:** Cognito user pool, username-based (no email), 3 pre-created accounts, roles
  admin/parent/student. Password resets go through Grahem (admin), not email.
- **AI:** all Bedrock calls are server-side (Lambda → Bedrock). Web search tool enabled for
  discovery, hydration, and benchmark research. Verify the latest available Sonnet inference
  profile with `aws bedrock list-inference-profiles --profile wnu` rather than hardcoding an ID.
- **Async work** (college/scholarship hydration, bulk discovery): SQS → worker Lambda, one item
  per message, dead-letter queue for failures. Hydration Lambdas get a 300s timeout; CRUD uses
  the default. The API returns immediately; the frontend polls hydration status.
- **IaC:** everything is infrastructure-as-code. TypeScript (AWS CDK) is recommended so the whole
  stack — infra, Lambdas, frontend — is one language. Build **infrastructure first**: stand up
  Cognito + the table + HTTP API + one Lambda and verify the auth flow end-to-end before touching
  the frontend. *(Confirm CDK vs SAM with Grahem before scaffolding the IaC.)*

## Privacy (do not get this wrong)
Keira can mark journal, clinical-hours, and "Why Nursing" entries `private`. Private entries are
hidden from grahem and kate, visible only to keira — but **always** available to the AI when keira
is the authenticated caller (that's the whole point of essay/interview help). Enforce visibility
at the API layer off the JWT identity. Never trust the client to filter.

## Conventions
- TypeScript end to end. Match patterns already in the repo before introducing new ones.
- Small, focused modules with one responsibility and clear interfaces. If a file is growing into
  several concerns, split it.
- No hardcoded config; no secrets in code or git.
- Lightweight by default — reach for a dependency only when it clearly earns its place.

## Git
- **Branch off `dev`/`development`, never `main`/`master`. PRs target `dev`/`development`.**
  Never merge to `main`/`master` on your own initiative — only when Grahem explicitly says so.
- **Standing authorization (granted 2026-06-16):** when a task is complete and verified
  (typecheck + tests + lint green), you may commit, push, open a PR into `dev`, and merge it
  **without asking each time**. A push to `dev` auto-deploys to staging via GitHub Actions —
  that is the intended "deploy when done." Still announce what you shipped and link the PR.
- This authorization stops at `dev`/staging. `main`/`master` and any prod deploy still require
  Grahem's explicit say-so, every time.

## Verify before claiming done
Run it; don't assume. Hit the real endpoint. For auth/privacy, prove a parent **cannot** read a
private entry and keira **can**. For deploys, re-confirm `get-caller-identity` is the wnu account
first. Evidence before assertions.
