# Foundational — Hydration Bundle (async SQS worker wiring)

**Unit id:** `foundational-hydration-bundle`  ·  **Wave:** 0 (foundational)  ·  **Owner:** infrastructure
**Blocks:** college-hub (#19) async hydration, and every future module that hydrates via SQS
(scholarship-tracker, etc.). Mirrors what `foundational-backend-bundle` did for routes.

## Problem
The mandated architecture is async hydration: API enqueues to SQS → worker Lambda consumes one
message at a time → DLQ on failure (CLAUDE.md). The seam exists but two foundational pieces are
missing, so module workers can't complete it (they correctly refuse to edit frozen/shared files):

1. **`@aws-sdk/client-sqs` is not in `backend/package.json`** — a module can't reference the SQS
   client to build its enqueuer.
2. **`backend/scripts/build-lambda.mjs` globs only `routes.manifest.ts`**, not module
   `hydration.manifest.ts`. So `backend/lambda/hydration.ts`'s `hydrationRegistry` is never
   populated — an enqueued message reaches no handler.

The convention is already established by the college-hub worker (do not change it):
- `backend/lambda/hydration.ts` exports `hydrationRegistry: Record<string, HydrationHandler>`
  (`HydrationHandler = (payload: unknown) => Promise<void>`) and dispatches by message `type`.
- Each hydrating module ships `backend/modules/<m>/hydration.manifest.ts` registering its
  handler(s) by type (mirroring `routes.manifest.ts`). college-hub already has
  `hydration.manifest.ts` + `hydration.ts` + `hydration.test.ts` on `feat/college-hub`.

## Deliverables
1. **`backend/package.json`** — add `@aws-sdk/client-sqs` (^3.700.0 to match the other aws-sdk
   deps) to `dependencies`; update the root lockfile. *(Supervisor may instead land this dep
   directly on dev to unblock the enqueuer side sooner — coordinate so this PR doesn't dup it.)*
2. **`backend/scripts/build-lambda.mjs`** — add a hydration codegen mirroring the routes barrel:
   - Discover modules that ship `hydration.manifest.ts` (parallel to the existing
     `routes.manifest.ts` discovery), deterministic sort.
   - Generate `backend/lambda/generated/hydration-manifests.ts` — a barrel that **statically
     imports** each module's `hydration.manifest` and merges them into the registry shape the
     worker expects (match `hydration.manifest.ts`'s export contract exactly — read college-hub's
     to confirm the shape: a map of `type → HydrationHandler`, or `{ handlers }`).
   - Keep the committed generated file in sync (committed so `tsc --noEmit` passes), like the
     routes barrel. Fail loudly on a duplicate `type` across modules (mirror `collectRoutes`).
3. **`backend/lambda/hydration.ts`** — import the generated hydration barrel and populate
   `hydrationRegistry` from it at module load (registry no longer hand-empty). Keep the existing
   batchSize-1 / reportBatchItemFailures / DLQ behavior.
4. **No CDK change needed** — `Code.fromAsset(backend/dist/hydration)` already ships whatever the
   build emits; the presynch/predeploy hooks already run `build:lambda`.

## Acceptance
- `npm run -w backend build:lambda` regenerates BOTH barrels; `backend/dist/hydration/index.js`
  contains the module handlers (bundle size grows past the ~1KB stub once a module registers one).
- `tsc --noEmit`, `lint`, `check:routes`, and tests green; add/extend a test proving the hydration
  registry is populated from module manifests and that duplicate types fail the build.
- After deploy, a message enqueued with college-hub's hydration `type` is dispatched to its handler
  (not "no handler — draining"). Verify against staging (`--profile wnu`, account `010928187255`):
  send a test message to the staging hydration queue and confirm the worker processed it (logs /
  the row it hydrates), DLQ empty.
- Boundaries: edit only `backend/package.json`, `backend/scripts/build-lambda.mjs`,
  `backend/lambda/hydration.ts` (+ generated file), lockfile. Do NOT edit module handlers.

## After this lands
The college-hub worker flips its `routes.manifest.ts` enqueue path inline→`makeSqsEnqueuer()` (one
line, per its checkpoint) and college-hub becomes spec-compliant async → unblocks its merge, which
in turn unblocks course-planner's prereq matrix.
