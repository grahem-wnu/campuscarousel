# scholarship-tracker — checkpoint

## worker-3 @ 2026-06-06 — PR #21 (draft, backend in; frontend in progress)

Wave-2 module. Family-visible (no private state → no privacy test). Backend committed (ea3408c);
frontend lands as a follow-up commit on the same PR.

### Status
- **Working synchronously (6 endpoints):** GET /scholarships (filter type/status/linkedCollege/
  deadlineBefore), GET /:id, POST (addedBy=manual), PUT, DELETE, GET /scholarships/summary
  (budget impact off the budget singleton). POST /bulk-add saves selected discoveries synchronously
  (best-effort hydrate enqueue — a saved record is never lost if the queue is down).
- **Gated behind DI → clean 503** (pure prompt/parse/message helpers built + tested): POST /discover
  (Bedrock + web search), POST /:id/hydrate (SQS enqueue; enqueues before mutating so 503 leaves
  state clean).
- 42 backend tests green; typecheck/eslint/check:routes clean.

### 🔶 FOUNDATIONAL GAP — async discovery/hydration (out of my lane; supervisor, please resolve)
Per specs/foundational/api.md, discovery + hydration run on the 300s SQS worker. Two pieces are
missing and are foundational (a module may not edit them):
1. **`@aws-sdk/client-sqs` not in `backend/package.json`.** The routing Lambda already has
   `HYDRATION_QUEUE_URL` + `grantSendMessages` (infra/lib/api-stack.ts), but can't enqueue without
   the SDK. Same kind of escalation as the Bedrock dep (resolved fast for goal-tracker/certifications).
2. **No module hydration-handler registration.** `backend/lambda/hydration.ts`'s `hydrationRegistry`
   is hardcoded-empty; `build-lambda.mjs` only globs `routes.manifest.ts`. **Recommend** adding a
   `hydration.manifest.ts` glob in build-lambda.mjs (mirroring routes — append-only, parallel-safe)
   so modules register a worker handler keyed by message `type` (mine: `scholarship-hydrate`).
   **college-hub (parallel) needs the identical mechanism** → worth doing once as a shared contract.

When both land I'll add a real Bedrock+web-search `ScholarshipDiscoverer` (on the worker), a real
SQS-backed `HydrationEnqueuer`, and a `scholarship-hydrate` worker handler. The DI seams make these
drop-in (same as goal-tracker's Bedrock suggester once its dep landed). Until then the two endpoints
503 cleanly and the UI degrades to "add manually".

### Boundaries
All under backend/modules/scholarship-tracker/** (+ frontend/src/modules/scholarship-tracker/** to
come) + the two manifests. No shared/foundational file touched. No hardcoded config; identity off the
JWT; model id + queue url from env.
