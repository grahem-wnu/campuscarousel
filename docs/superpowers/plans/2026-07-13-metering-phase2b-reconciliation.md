# Phase 2B — Reconciliation + Rollups + Drift Alerting — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A **prod-only** scheduled job that (1) recomputes per-tenant monthly usage rollups from raw records, (2) reconciles the app's summed Bedrock cost/tokens against AWS actuals (Cost Explorer $ + Bedrock invocation-log tokens), and (3) alerts on drift beyond a threshold. Plus a small platform-admin surface for the latest drift status.

**Scoping decision (approved):** reconciliation runs **in prod only**. Staging + prod share one AWS account and one Bedrock inference profile, so AWS actuals are account-global and can't separate the two — staging's tiny QA usage is absorbed as noise by the drift threshold. Therefore the invocation-log S3 bucket + the account-global `CfnModelInvocationLoggingConfiguration` + the reconcile Lambda + its schedule are created **only in the prod stack** (`config.stage === 'prod'`), which also avoids the account-global single-owner conflict.

**Architecture:** Pure compute (windows, drift, rollup shaping) is isolated and unit-tested. The reconcile handler takes injectable ports (`CostExplorerPort`, `InvocationLogPort`, `AlertPort`, `MetricsPort`, table client, `now`) so it is fully testable with fakes; `backend/lambda/reconcile.ts` wires the real AWS SDK clients. Reuses Phase 1/2A helpers (`reads.ts`, `families.ts`). Alerts publish to the existing `ObservabilityStack` SNS topic (ARN read from SSM at runtime — SNS-only, no email budget subscriber; see the AWS budget-email deploy trap).

**Reference spec:** `docs/superpowers/specs/2026-07-12-per-family-token-cost-metering-design.md` → "Phase 2 — finalized design" → Sub-project B.

**Conventions:** tests from repo root; integer micro-dollars; `.js` relative imports; commit per green step with the standard Co-Authored-By / Claude-Session trailer. **The dashboard stays on-read (2A) — rollups are a stored monthly artifact + reconciliation substrate, NOT wired into the dashboard read path in this phase.**

**Money note:** Cost Explorer returns dollars as decimal strings (e.g. `"12.34"`). Convert to micro-dollars with `Math.round(parseFloat(x) * 1_000_000)` — never store the float.

---

## Chunk 1: Pure compute (windows, drift, rollup shaping)

**Files:** Create `backend/modules/reconciliation/compute.ts` + `compute.test.ts`.

- [ ] **Step 1: Failing test** covering:
  - `monthWindows(nowIso)` → the current + prior calendar month (UTC), each `{ month: 'YYYY-MM', from: ISO first-of-month, to: ISO first-of-next-month }`. Test a mid-month date and a Jan date (Dec prior-year rollover).
  - `driftPct(appMicros, awsMicros)` → signed percentage of AWS baseline: `awsMicros === 0 ? (appMicros === 0 ? 0 : 100) : ((appMicros - awsMicros) / awsMicros) * 100`. Test app>aws, app<aws, both zero, aws zero.
  - `isBreach(driftPct, thresholdPct)` → `Math.abs(driftPct) > thresholdPct`.
  - `rollupItems(month, tenantSummaries)` → one derived DynamoDB item per tenant: `{ PK: 'GLOBAL#USAGE', SK: 'ROLLUP#<month>#T#<tenantId>', month, tenantId, familyName, costMicros, inputTokens, outputTokens, calls, unpricedCostMicros?, computedAt }`. Assert shape + that it's idempotent (same inputs → same keys).

- [ ] **Step 2: Run, verify fail. Step 3: Implement** `compute.ts` (pure functions only; take `now`/`computedAt` as ISO string params — do NOT call `new Date()` inside pure functions so tests are deterministic). **Step 4: PASS. Step 5: Commit** — `feat(reconciliation): pure month-window, drift, and rollup-shaping helpers`

---

## Chunk 2: Reconcile handler + ports (injectable, testable)

**Files:** Create `backend/modules/reconciliation/ports.ts`, `reconcile.ts`, `reconcile.test.ts`.

### Task 2.1: Ports

- [ ] `ports.ts` — interfaces + result types:

```ts
// backend/modules/reconciliation/ports.ts
export interface CostExplorerPort {
  /** Actual AWS Bedrock cost (micro-dollars) for [from, to) — unblended, service=Amazon Bedrock. */
  bedrockCostMicros(fromDate: string, toDate: string): Promise<number>;
}
export interface InvocationLogPort {
  /** Summed input+output tokens from Bedrock model-invocation logs for [from, to). */
  tokenTotals(fromIso: string, toIso: string): Promise<{ inputTokens: number; outputTokens: number }>;
}
export interface AlertPort {
  publish(subject: string, message: string): Promise<void>;
}
export interface MetricsPort {
  emit(metrics: { appCostMicros: number; awsCostMicros: number; driftPct: number; month: string }): Promise<void>;
}
```

### Task 2.2: Handler

- [ ] **Step 1: Failing test** (`reconcile.test.ts`) using an `InMemoryTableClient` + fake ports. Seed a few tenants (`data.tenants.create`) and raw `T#<tenant>#USAGE` rows across the current month. Assert `runReconciliation(...)`:
  - writes rollup rows (`GLOBAL#USAGE` / `ROLLUP#<month>#T#<tenant>`) with correct per-tenant sums,
  - writes a reconciliation status row (`GLOBAL#RECON` / `MONTH#<month>`) carrying `appCostMicros`, `awsCostMicros`, `driftPct`, `appTokens`, `awsTokens`, `breach`, `computedAt`, `caveat`,
  - calls `alert.publish` **only** when `|driftPct| > threshold` (test a breach case and a within-threshold case),
  - calls `metrics.emit` every run.
  - Uses injected `now` for determinism.

- [ ] **Step 2: Run, verify fail. Step 3: Implement** `runReconciliation(deps)` where `deps = { data, baseClient, costExplorer, logs, alert, metrics, now: () => string, thresholdPct }`:
  1. `const windows = monthWindows(deps.now())`.
  2. For each window: enumerate `data.tenants.list()`; for each tenant `queryAll(baseClient, 'T#<tenant>#USAGE', rangeToSkOpts(from, to))` → `toUsageRow` → `summarizeFamily`; accumulate app cost/tokens + per-tenant rollup rows; sum `unpriced` cost separately.
  3. `awsCostMicros = await costExplorer.bedrockCostMicros(fromDate, toDate)` (dates as `YYYY-MM-DD`); `awsTokens = await logs.tokenTotals(from, to)`.
  4. `driftPct = driftPct(appCostMicros, awsCostMicros)`; `breach = isBreach(driftPct, thresholdPct)`.
  5. `baseClient.put` all rollup rows + the status row (`GLOBAL#RECON` / `MONTH#<month>`), including a `caveat` string: `"account-total incl. staging noise; Cost Explorer ~24h delayed"`.
  6. `await metrics.emit({...})`; if `breach` `await alert.publish(...)`.
  7. Never throw on a single-tenant read error — try/catch per tenant, log, continue (mirror `digest.ts`).
- [ ] **Step 4: PASS. Step 5: Commit** — `feat(reconciliation): runReconciliation — rollups + drift check over injectable ports`

### Task 2.3: Real port adapters + Lambda entry

- [ ] Create `backend/modules/reconciliation/aws-ports.ts` — real adapters using AWS SDK v3:
  - `costExplorerPort()` → `@aws-sdk/client-cost-explorer` `GetCostAndUsageCommand` (Granularity MONTHLY, Metrics `["UnblendedCost"]`, Filter `{ Dimensions: { Key: 'SERVICE', Values: ['Amazon Bedrock'] } }`); sum `ResultsByTime[].Total.UnblendedCost.Amount` → micros via `Math.round(parseFloat*1e6)`. **Cost Explorer client region is `us-east-1`** regardless of app region.
  - `invocationLogPort(bucket)` → `@aws-sdk/client-s3`: list objects under the date-partitioned prefix for the window, read the JSONL invocation records, sum `input.inputTokenCount`/`output.outputTokenCount` (confirm the exact field path against a real record during verification — Bedrock invocation-log schema; default missing to 0). Guard for an empty/not-yet-populated bucket (return zeros).
  - `snsAlertPort(topicArn)` → `@aws-sdk/client-sns` `PublishCommand`.
  - `cwMetricsPort(namespace)` → `@aws-sdk/client-cloudwatch` `PutMetricDataCommand` (metrics `AppCostMicros`, `AwsCostMicros`, `DriftPct`, dimension `Stage`).
- [ ] Create `backend/lambda/reconcile.ts`:

```ts
import { dataFromEnv, tableClientFromEnv } from '../shared/data/index.js';
import { runReconciliation } from '../modules/reconciliation/reconcile.js';
import { costExplorerPort, invocationLogPort, snsAlertPort, cwMetricsPort } from '../modules/reconciliation/aws-ports.js';

export const handler = async (): Promise<unknown> => {
  const bucket = process.env.RECON_LOG_BUCKET;
  const ssmPrefix = process.env.SSM_PREFIX;
  const thresholdPct = Number(process.env.RECON_DRIFT_THRESHOLD_PCT ?? '5');
  if (!bucket || !ssmPrefix) throw new Error('reconcile: RECON_LOG_BUCKET / SSM_PREFIX not set');
  // Resolve the alarm topic ARN from SSM at RUNTIME (avoids the deploy-ordering hazard).
  // Reuse the repo's shared SSM reader if one exists; else @aws-sdk/client-ssm GetParameter on `${ssmPrefix}/alarmTopicArn`.
  const topicArn = await readSsmParam(`${ssmPrefix}/alarmTopicArn`);
  const result = await runReconciliation({
    data: dataFromEnv(),
    baseClient: tableClientFromEnv(),
    costExplorer: costExplorerPort(),
    logs: invocationLogPort(bucket),
    alert: snsAlertPort(topicArn),
    metrics: cwMetricsPort('KeirasJourney/Metering'),
    now: () => new Date().toISOString(),
    thresholdPct,
  });
  console.log('reconcile:', JSON.stringify(result));
  return result;
};
```

- [ ] Add SDK deps to `backend/package.json`: `@aws-sdk/client-cost-explorer`, `@aws-sdk/client-sns`, `@aws-sdk/client-cloudwatch`, and `@aws-sdk/client-ssm` (for the runtime topic-ARN read, unless a shared SSM reader already exists — check `backend/shared` first). `@aws-sdk/client-s3` is **already** a backend dep (no add). This is a single-lockfile npm-workspaces repo (no `backend/package-lock.json`) — you **MUST commit the resulting root `package-lock.json` delta** for the new packages (else `npm ci` in CI fails). Revert only *unrelated* churn (e.g. root `.gitignore`), not the legitimate lock additions.
- [ ] Add the bundle entry in `backend/scripts/build-lambda.mjs`: `await bundle('lambda/reconcile.ts', 'reconcile');`
- [ ] `npm run typecheck` + `npm test -- backend/modules/reconciliation` green. **Commit** — `feat(reconciliation): AWS port adapters + reconcile Lambda entry`

---

## Chunk 3: Infra (CDK) — prod-only

**Files:** Modify `infra/lib/policies.ts`, `infra/lib/async-stack.ts`, and (for the log bucket + logging config) `infra/lib/async-stack.ts` or a small addition; possibly `infra/lib/observability-stack.ts` for a drift alarm. Guard everything on `config.stage === 'prod'`.

- [ ] **Step 1: Policy statements** in `infra/lib/policies.ts` (mirror the existing least-privilege style):
  - `costExplorerReadStatement()` — actions `["ce:GetCostAndUsage"]`, `resources: ["*"]` (CE has no resource ARNs — comment this exception).
  - `s3ReadStatement(bucketArn)` — `["s3:GetObject","s3:ListBucket"]` on `[bucketArn, bucketArn + '/*']`.
  - `snsPublishStatement(topicArn)` — `["sns:Publish"]` on `[topicArn]`.
  - `cloudwatchPutMetricStatement()` — `["cloudwatch:PutMetricData"]`, `resources:["*"]` (PutMetricData has no ARNs; comment).

- [ ] **Step 2: In `async-stack.ts`, guarded `if (config.stage === 'prod')`:**
  - Create the invocation-log S3 bucket (mirror `assets-stack.ts` bucket style: `blockPublicAccess: BLOCK_ALL`, `encryption: S3_MANAGED`, `enforceSSL: true`, `removalPolicy: RETAIN` for prod). Add a bucket policy granting the Bedrock service principal (`bedrock.amazonaws.com`) `s3:PutObject` (with the `aws:SourceAccount` condition = this account).
  - **Enable Bedrock model-invocation logging via an `AwsCustomResource`** (NOT an L1 — `CfnModelInvocationLoggingConfiguration` / `AWS::Bedrock::ModelInvocationLoggingConfiguration` does NOT exist; model-invocation logging is API-only). Use `AwsCustomResource` from `aws-cdk-lib/custom-resources`:
    - `onCreate`/`onUpdate`: `{ service: 'Bedrock', action: 'PutModelInvocationLoggingConfiguration', parameters: { loggingConfig: { s3Config: { bucketName: bucket.bucketName, keyPrefix: 'bedrock-invocation-logs/' }, textDataDeliveryEnabled: true, imageDataDeliveryEnabled: false, embeddingDataDeliveryEnabled: false } }, physicalResourceId: PhysicalResourceId.of('bedrock-invocation-logging') }`.
    - `onDelete`: `{ service: 'Bedrock', action: 'DeleteModelInvocationLoggingConfiguration' }`.
    - `policy: AwsCustomResourcePolicy.fromStatements([ new PolicyStatement({ actions: ['bedrock:PutModelInvocationLoggingConfiguration','bedrock:DeleteModelInvocationLoggingConfiguration'], resources: ['*'] }) ])` (these actions have no resource ARNs — comment the `*`).
    - **Account+region-global — only prod creates it.** Add `customResource.node.addDependency(bucketPolicy)` so the bucket can receive logs before the config activates.
  - Define the reconcile Lambda (classic `LambdaFunction` + `Code.fromAsset('../../backend/dist/reconcile')`, `timeout: Duration.seconds(120)`, `memorySize: 256`, `logRetention: ONE_MONTH`) with env `{ TABLE_NAME, STAGE, RECON_LOG_BUCKET: bucket.bucketName, RECON_DRIFT_THRESHOLD_PCT: '5', SSM_PREFIX: config.ssmPrefix }`. **Do NOT inject the alarm topic ARN at deploy time** (cross-stack SSM read has a from-scratch deploy-ordering hazard: AsyncStack deploys before ObservabilityStack; and prop-passing is a circular dep since obs already consumes async's worker name). Instead the Lambda **resolves `${SSM_PREFIX}/alarmTopicArn` from SSM at runtime** (by the time the daily schedule fires, obs has long since written it) — see the Lambda entry in 2.3.
  - Grants: `table.grantReadWriteData(fn)`; `fn.addToRolePolicy(costExplorerReadStatement())`, `s3ReadStatement(bucket.bucketArn)`, `snsPublishStatement('arn:aws:sns:'+region+':'+account+':'+config.namePrefix+'-alarms')` (construct the topic ARN by convention for the grant — the runtime read still comes from SSM), `cloudwatchPutMetricStatement()`, **`ssmReadConfigStatement(this.region, this.account, config.ssmPrefix)`** (for the runtime topic-ARN read — this grant was missing).

  **Required new imports in `async-stack.ts`** (extend the existing imports — `Rule`/`Schedule`/`LambdaFunctionTarget`/`Code`/`LambdaFunction`/`Duration`/`RetentionDays`/`CfnOutput`/`putOutput` are already imported): `Bucket, BlockPublicAccess, BucketEncryption` from `aws-cdk-lib/aws-s3` (currently only `type IBucket`); `RemovalPolicy` from `aws-cdk-lib`; `AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId` from `aws-cdk-lib/custom-resources`; `PolicyStatement`, `ServicePrincipal` from `aws-cdk-lib/aws-iam` for the bucket policy.
  - Schedule: `new Rule(this, 'ReconcileSchedule', { schedule: Schedule.cron({ minute: '0', hour: '7' }), targets: [new LambdaFunctionTarget(fn)] })` (daily 07:00 UTC).
  - `putOutput` + `CfnOutput` the reconcile function name.

- [ ] **Step 3:** `npx cdk synth KeirasJourney-Async-staging` and `...-prod` (from `infra/`, with `--profile wnu` context if needed) — **staging synth must NOT contain the bucket / logging config / reconcile Lambda** (prod-only guard), and **prod synth must contain all three**. This is the key infra check.
- [ ] **Step 4:** `npm run typecheck` (infra is part of the workspace) green. **Commit** — `feat(infra): prod-only Bedrock invocation logging + reconciliation Lambda (daily)`

---

## Chunk 4: `GET /admin/usage/reconciliation` + frontend panel

**Files:** Modify `backend/modules/admin-usage/handlers.ts` + `routes.manifest.ts` + `router.test.ts`; regenerate manifests. Frontend `admin-usage/{types,api,AdminUsagePage}.tsx` + test.

- [ ] **Backend:** add a `reconciliation` handler (`platformAdmin: true`) that reads the latest status row **with a direct `get('GLOBAL#RECON', 'MONTH#<month>')`** for `?month=` (default current month). **Do NOT use `rangeToSkOpts`** — that builds `TS#…` ranges and is wrong for `MONTH#`-keyed rows; use `get` (or `query('GLOBAL#RECON', { skBeginsWith: 'MONTH#' })` if listing). The handler needs the base client via `getClient()` (already a dep). Returns `{ month, appCostMicros, awsCostMicros, driftPct, breach, computedAt, caveat }` or `{ month, status: 'not_computed' }` when absent (staging always returns not_computed — reconciliation is prod-only). Route `{ method: 'GET', path: '/admin/usage/reconciliation', handler: h.reconciliation, platformAdmin: true }`. Add tests: returns a seeded status row; 404-or-not_computed when absent; non-platform admin 403. Regenerate manifests + `check:routes`.
- [ ] **Frontend:** on the Usage page, for a platform admin in the families view, a small **Reconciliation** panel (Field Notes, no chart) showing the latest month's drift: `app $ vs AWS $`, drift %, a green/amber status by `breach`, `computedAt`, and the caveat text. Gracefully render "not yet computed" when `status: 'not_computed'`. Add a `getReconciliation()` api fn + types + a test (renders drift; renders not-computed).
- [ ] Full `npm test` + `typecheck` + `lint` + `check:routes` green. **Commit(s)** per piece.

---

## Chunk 5: Gates + deploy + verify

- [ ] **Full gates from root:** `npm run typecheck && npm run lint && npm run check:routes && npm test` — all green.
- [ ] **Ship to dev/staging:** push the branch, PR into `dev`, CI + CodeRabbit, address findings, merge → staging deploy. **Staging deploy is the safety check that the prod-only guards don't break staging synth/deploy** (staging has no reconcile Lambda). Confirm the Async-staging stack deploys clean and the `/admin/usage/reconciliation` endpoint returns `not_computed` on staging.
- [ ] **Prod (requires Grahem's explicit go — do NOT self-merge to main):** after his go, `dev → main`, confirm `get-caller-identity` is `wnu`/`010928187255`, let Deploy Prod run. Then **manually invoke** the prod reconcile Lambda once (`aws lambda invoke --function-name keiras-journey-prod-metering-reconcile ... --profile wnu`) and verify: it writes a `GLOBAL#RECON` status row; the drift is within threshold (or the alert fired for a real gap); Cost Explorer returned a number; the invocation-log token path found records (confirm the exact token field path against a real log object and fix `invocationLogPort` if the field name differs). Then load the reconciliation panel as platform admin.
- [ ] **Notify** with the outcome + PR link.

## Notes / caveats to carry into the UI + code comments
- Reconciliation is **account-total and prod-only**; staging Bedrock usage is unattributable noise absorbed by the threshold. Render this caveat in the panel.
- Cost Explorer is **~24h delayed** and dollar-granular; today's drift for the current month is expected to be noisy near month start — the prior-month window is the stable check.
- Invocation-log token field path is **verify-at-prod** (Bedrock log schema); default missing fields to 0 so a schema surprise never throws.
