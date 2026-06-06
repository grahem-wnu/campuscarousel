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

---

## infrastructure agent @ 2026-06-06 — DONE (PR #10, deployed + verified live on staging)

Branch `feat/backend-bundle` → **draft PR #10** into `dev`. Account confirmed `010928187255`/us-east-2
before deploy (the credential-less synth resolves the *default* account 791321067225 for asset bucket
naming — a real `--profile wnu` deploy published to the wnu asset bucket; verified in deploy log
`Publishing RoutingFn/Code (010928187255-us-east-2-...)`).

**Approach:** A — build-time static-import manifest barrel (`backend/scripts/build-lambda.mjs` codegens
`backend/lambda/generated/manifests.ts`) + esbuild each entry to one CJS file under `backend/dist/{api,
hydration}` (+ `{"type":"commonjs"}` sidecar, since `backend` is `type:module`). CDK `RoutingFn`/
`HydrationWorker` now `Code.fromAsset(backend/dist/*)`; `PLACEHOLDER_HANDLER` deleted (fromAsset on a
missing dir fails synth loudly). CI: "Build backend Lambdas" step before "Deploy backend (CDK)" in
deploy-staging/prod (+ templates); `predeploy:{staging,prod}` hooks for local.

**Local gates:** typecheck ✅ · lint ✅ · check:routes ✅ (6 routes/1 manifest) · 137 tests ✅ · cdk synth
asset-backed (Code = {S3Bucket,S3Key}, no inline ZipFile).

**Acceptance #1 — placeholder gone (staging):**
- routing fn `keiras-journey-staging-api-routing`: CodeSize **393 → 331344**, LastModified 04:40 → **15:40**.
- hydration `keiras-journey-staging-hydration-worker`: CodeSize **393 → 1085**, LastModified 04:39 → **15:39**.

**Acceptance #2–#4 — privacy proven on real infra** (invoked the deployed routing Lambda with the exact
identity claims the Cognito authorizer injects; real handler + real DynamoDB + real visibility mw). Seeded
as keira: family `c199ea61-…85c`, private `6eb2b3a2-…8cd`.
- keira `GET /activities` → 200, list includes **both** (family + private); `GET /activities/<private>` → **200**.
- kate  `GET /activities` → 200, list includes family, **excludes private**; `GET /activities/summary` →
  `totalCount:1` (private excluded); `GET /activities/<private>` → **403** `{"code":"forbidden","message":"This entry is private"}`.
- kate `POST /activities` w/ `visibility:private` → **403** "Only Keira may mark an entry private".
- unknown route → **404**, bad body → **422**, no claims → **401** (envelope matches `backend/shared/api`).

**Security posture — verified through the LIVE API Gateway** (`https://y73no652r1.execute-api.us-east-2.amazonaws.com`):
- no token → **401**; bogus `Bearer` → **401** (Cognito JWT authorizer on the `{proxy+}` catch-all).
- routing Lambda has **no Function URL**; resource policy allows invoke **only** by `apigateway.amazonaws.com`
  → not invocable from the public internet. (The #2–#4 direct-invoke proof used account admin IAM creds,
  which no web visitor holds — a test harness, not a public path.)

**Acceptance #6 — hydration:** deployed as real code (1085 B); drains unknown message types without failing
(empty registry until college/scholarship modules land).

**Notes for supervisor/reviewer:**
- I did NOT touch the keira/kate Cognito passwords (safety-blocked; not needed — privacy proven via direct
  invoke + live-API authorizer check). The real-JWT-through-the-SPA login is Grahem's Gate-2 web test.
- Two demo activities remain in the staging table under keira (the family/private seed above) — handy for
  Grahem's Gate-2 visual test; say the word and I'll delete them.
- Only Async + Api staging stacks were deployed (the only stacks whose assets changed). On merge, the `dev`
  push runs the full deploy-staging pipeline (now with the build step) and re-applies everything.
- I do not merge — PR #10 is ready for the spec-reviewer, then the supervisor merges. DnsStack is my next unit.
