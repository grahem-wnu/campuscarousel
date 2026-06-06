# foundational-backend-bundle — checkpoint

## supervisor @ resume — ASSIGNMENT (owner: infrastructure agent)

**Why this exists / what I found (verified live in wnu 010928187255/us-east-2):**
- `keiras-journey-staging-api-routing` and `-hydration-worker` are deployed with
  `Code.fromInline(PLACEHOLDER_HANDLER)` (see `infra/lib/api-stack.ts` `RoutingFn`,
  `infra/lib/async-stack.ts` `HydrationWorker`). Deployed routing fn = **393 bytes**, last
  modified at infra-deploy time (04:40) — untouched by the activity-journal merge or any deploy.
- The deploy workflow (`.github/workflows/deploy-staging.yml`) only runs `cdk deploy` + frontend
  build/publish. **No step builds `backend/` into a Lambda asset.** So merged module handlers
  (activity-journal) never run; `GET /activities` with a token returns the placeholder 503.
- The Cognito JWT authorizer works (401 no-token, verified). Frontend publish works (staging 200).
  The **only** missing path is backend code → Lambda.
- The router is ready: `backend/shared/api` exports `createLambdaHandler`, `loadRoutes`,
  `loadManifests`, `collectRoutes`. Intended entry per `backend/shared/api/index.ts`:
  `createLambdaHandler(await loadRoutes(MODULES_DIR))`. Missing: the entry file, a build step,
  CDK `fromAsset` wiring, and the CI build step.

**Your task:** implement spec `specs/foundational/backend-bundle.md` (full deliverables +
acceptance there). Branch `feat/backend-bundle` off dev, in `.worktrees/infra` (or your infra
worktree). Open a PR into dev. This is **eligible now** (deps all merged) and **blocks Gate 2** —
it is the top priority before any wave-2 fanout.

**Key design note:** `loadManifests` does a runtime fs-scan + dynamic import of
`routes.manifest.js`, which a single-file esbuild bundle breaks. Either (A, recommended)
codegen a static-import manifest barrel at build time + esbuild to one `dist/api/index.js`, or
(B) tsc-compile the tree and `loadRoutes(join(__dirname,'modules'))` at runtime. Keep the
cross-module duplicate-route invariant (`collectRoutes`/`check:routes`).

**Definition of done = the live proof (acceptance #1-#6 in the spec):** after a staging deploy,
the routing fn is no longer ~393 bytes; with a **keira** JWT `GET /activities` returns her
private entries; with a **kate** JWT they are excluded (403 on a private id). Put the curl/CLI
evidence here. That live proof is exactly what makes Gate 2 testable for Grahem.

**Account guard:** confirm `aws sts get-caller-identity --profile wnu` == 010928187255 before any
deploy. Never 791321067225.
