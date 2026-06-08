# Foundational — Backend Bundle & Lambda Deploy

**Unit id:** `foundational-backend-bundle`  ·  **Wave:** 0 (foundational)  ·  **Owner:** infrastructure
**Status:** blocks Gate 2. Until this ships, the API serves a placeholder and no module backend runs.

## Problem (verified 2026-06-06)
The API Gateway routing Lambda and the SQS hydration worker are deployed with
`Code.fromInline(PLACEHOLDER_HANDLER)` (`infra/lib/api-stack.ts` construct `RoutingFn`,
`infra/lib/async-stack.ts` construct `HydrationWorker`). Nothing builds `backend/` into a Lambda
asset, and the deploy workflow only runs `cdk deploy`. So every deploy re-ships the placeholder:
the deployed `keiras-journey-<env>-api-routing` is 393 bytes, last modified at infra-deploy time,
and `GET /activities` with a valid token returns the placeholder 503 — even though the
`activity-journal` handlers are merged on `dev`. The Cognito JWT authorizer works (401 without a
token); the frontend build+publish works; **only the backend code path is missing.**

The router was built for this: `backend/shared/api` already exports `createLambdaHandler` and
`loadRoutes`/`loadManifests` (runtime scan of `backend/modules/<m>/routes.manifest.js` + dynamic
import). The intended entry is `createLambdaHandler(await loadRoutes(MODULES_DIR))`
(see `backend/shared/api/index.ts`). What is missing is: the entry file(s), a build/bundle step,
the CDK `Code.fromAsset` wiring, and the CI build step.

## Goal
Make `npm`/CI build the real backend into a deployable Lambda asset, point both Lambdas at it,
and run the build before `cdk deploy` in the pipeline — so a `dev` push deploys the actual
handlers and `GET /activities` serves real, privacy-enforced data on staging.

## Deliverables

### 1. Lambda entrypoints (new — `backend/lambda/**`)
- `backend/lambda/api.ts` — exports `handler` (HTTP API v2 signature, i.e. `LambdaHandler` from
  `backend/shared/api`). It assembles the router from **all** module route manifests and dispatches.
  Use the existing `createLambdaHandler` + the aggregated routes. Identity/role/privacy logic is
  already inside the router + handlers — do not reimplement it.
- `backend/lambda/hydration.ts` — exports `handler` (SQS event). A real, minimal worker entry:
  parse one record, dispatch to a (currently empty) hydration registry, log, and let failures go
  to the DLQ. Full hydration behavior arrives with the college/scholarship modules; this just has
  to be real code shipped from `backend/`, not the inline placeholder.

### 2. Manifest assembly that survives bundling
`loadManifests` scans the filesystem and dynamic-imports `routes.manifest.js` — that does not
survive a tree-shaking single-file bundle. Pick one (A recommended):
- **A — esbuild single-file + build-time manifest codegen (recommended):** a small build script
  globs `backend/modules/*/routes.manifest.ts`, generates a barrel with **static** imports of each
  manifest, esbuild-bundles `backend/lambda/api.ts` (+ the barrel) to one `dist/api/index.js` with
  no `node_modules` to ship. The entry uses the generated static manifest list (via `collectRoutes`)
  instead of `loadRoutes`. Fast cold start, single artifact.
- **B — tsc tree + runtime scan:** compile `backend/` to JS preserving structure, ship the tree as
  the asset, entry calls `loadRoutes(join(__dirname, 'modules'))`. Keeps `loadManifests` as-is but
  must ship runtime deps. Acceptable if A is impractical.

Whichever is chosen, the cross-module duplicate-route invariant (`collectRoutes` / `check:routes`)
must still hold.

### 3. Build script (`backend/package.json`)
Add e.g. `"build:lambda"` producing `backend/dist/api/index.js` and `backend/dist/hydration/index.js`
(handler `index.handler`). Add `esbuild` as a devDependency if using A. Deterministic, no network.

### 4. CDK wiring (`infra/lib/api-stack.ts`, `infra/lib/async-stack.ts`)
- `RoutingFn`: `code: Code.fromAsset(path.join(__dirname, "../../backend/dist/api"))`, keep
  `handler: "index.handler"`, runtime Node 20, env unchanged.
- `HydrationWorker`: `Code.fromAsset(".../backend/dist/hydration")`, same pattern.
- Remove the `PLACEHOLDER_HANDLER` import/use from both (or keep the file only as an
  asset-missing guard). `cdk synth` must require the built asset to exist (so a forgotten build
  fails loudly rather than silently shipping a placeholder).

### 5. Pipeline (`.github/workflows/deploy-staging.yml` AND `deploy-prod.yml` — the ACTIVE files,
and mirror into the `infra/github-workflows/` templates)
Add a **"Build backend Lambdas"** step (`npm run -w backend build:lambda`) **before** the
"Deploy backend (CDK)" step, so the `fromAsset` directory exists at synth time. Keep the existing
frontend build + S3/CloudFront publish steps.

### 6. Local ergonomics
A `predeploy`/`prebuild` hook (or documented order) so a local `cd infra && npm run deploy:staging`
also builds the backend first. Don't break the existing `npm run -w infra deploy` invocation.

## Acceptance criteria (prove against the LIVE staging API — evidence in the checkpoint)
1. After a staging deploy, `keiras-journey-staging-api-routing` CodeSize is **not** ~393 bytes and
   `LastModified` advances; no `RoutingFn`/`HydrationWorker` ships `Code.fromInline`.
2. With a **keira** (student) JWT: `POST /activities` creates; `GET /activities` returns her
   entries **including** her `private` ones; `GET /activities/:id` on a private entry → 200.
3. With a **kate** (parent) JWT: `GET /activities` **excludes** keira's `private` entries; the
   summary aggregate excludes them; `GET /activities/:id` on a private entry → 403. (This is the
   spec's privacy rule, now proven end-to-end on real infra — the Gate 2 condition.)
4. Unknown route → 404 envelope; bad body → 422; no token → 401. Error envelope shape matches
   `backend/shared/api`.
5. `cdk synth` clean for both envs; both deploy; CI (typecheck, lint, test, check:routes) green.
6. Hydration worker deploys as real code from `backend/` (a no-op-but-real drain is fine for now).

## Boundaries
May edit: `backend/lambda/**` (new), `backend/package.json` (build script + esbuild dep),
`infra/lib/api-stack.ts`, `infra/lib/async-stack.ts`, `infra/lib/placeholder-handler.ts` (remove/
demote), `infra/package.json`, `.github/workflows/deploy-*.yml`, `infra/github-workflows/deploy-*.yml`.
Do **not** modify module handlers, the shared router/auth logic, the data layer, or design system —
consume them. If a shared contract genuinely needs a change, raise it on the checkpoint for the
supervisor rather than editing it. wnu account only (`010928187255`/us-east-2); confirm
`get-caller-identity` before any deploy.
