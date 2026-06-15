# Focus priority lane + hydration scale-out — design

**Status:** approved (Grahem, 2026-06-15). Fixes a latency/contention issue found while testing the
FTUE on staging.

## Problem

Clicking "Generate" on the Focus **Overview** or **Career Path** could take 5–8 minutes on staging.
Root cause (investigated, evidence-backed):

- The hydration worker has `reservedConcurrentExecutions: 3` (`infra/lib/async-stack.ts:77`) — a
  deliberate Bedrock throttle/cost guard.
- **All** web-grounded jobs share **one** queue + those 3 lanes: bulk **college-hydrate** (FTUE seeds
  ~12 colleges per kid, one job each) AND the interactive **focus-overview / career-path** jobs.
- At 3 lanes × ~2 min/job, a single FTUE seed wave takes ~8 min to drain; an interactive "Generate"
  enqueued during/after that wave waits behind it. Confirmed on staging: queue had 6 waiting + 5
  in-flight `college-hydrate`, worker durations 110–142s (clean, no timeouts), DLQ empty.

It is not a hang, timeout, failure, or Bedrock throttling — it is **lane contention**: bulk work
starves interactive work, and the bulk lane is capped at 3.

## Fix

Two parts (mirrors the existing assets pipeline, which already runs on its own queue + worker so
imagery "never queues behind the long Bedrock text hydration", `async-stack.ts:150`):

### 1. Priority lane for interactive focus jobs

- New family of resources in `AsyncStack`: a **`<prefix>-focus` queue + `<prefix>-focus-dlq`** and a
  **dedicated `focus-worker` Lambda** that reuses the SAME worker bundle (`backend/dist/hydration`) —
  the shared registry already routes `focus-overview` (and `kind: 'career'`) to the focus handlers.
  Its own `reservedConcurrentExecutions: 3`, 300s timeout, `batchSize: 1`, Bedrock + SSM + DynamoDB
  grants (same as the hydration worker).
- The API Lambda gets a new env var **`FOCUS_QUEUE_URL`** and `grantSendMessages` on the focus queue
  (wired in `api-stack.ts`, queue passed through `bin/infra.ts`).
- The focus dispatchers (`backend/modules/focus/overview.ts`, `careerpath.ts`) resolve the queue as
  `options.queueUrl ?? process.env.FOCUS_QUEUE_URL ?? process.env.HYDRATION_QUEUE_URL`. The fallback
  keeps local/dev/tests working unchanged and degrades safely if the env var is missing.

Result: a user clicking "Generate" runs on a lane that bulk college hydration never touches — it
starts immediately regardless of backlog.

### 2. Scale the bulk lane

- Raise the hydration worker `reservedConcurrentExecutions` from **3 → 10**. Total spend is per-token
  (unchanged); this only drains bursts faster. The ceiling is Bedrock requests-per-minute throttling,
  which the AWS SDK already retries with backoff. A 12-college FTUE wave now drains in ~2 min, not ~8.

College discovery/hydration (`college-hub`) stays on the bulk `HYDRATION_QUEUE_URL` — it is bulk work
and belongs there.

## Concurrency budget

Account limit 1000, ~997 unreserved. New reservations: hydration 10 + focus 3 (+ existing assets).
Negligible against the pool; the API Lambda stays on the unreserved pool.

## Testing

- Backend: unit-test that the focus enqueuers prefer `FOCUS_QUEUE_URL` and fall back to
  `HYDRATION_QUEUE_URL`. Existing focus tests (which inject `queueUrl` directly) stay green.
- Infra: `cdk synth` succeeds; the focus queue, DLQ, worker, event-source mapping, and the API
  Lambda's `FOCUS_QUEUE_URL` + send grant appear in the template; hydration worker reserved
  concurrency is 10.
- Post-deploy (staging): trigger a focus generate while a college-hydrate backlog exists; confirm it
  completes promptly on the focus queue rather than waiting behind the bulk lane.

## Out of scope

- Per-message priority within a single queue (SQS has no native priority — separate queues is the
  idiomatic fix).
- Autoscaling concurrency by load; a fixed bump to 10 is sufficient for current volume.
