# foundational-hydration-bundle — checkpoint

## supervisor @ 2026-06-06 — ASSIGNMENT (owner: infrastructure agent)

Spec: `specs/foundational/hydration-bundle.md` (on dev @9401837). This completes async hydration
so college-hub (#19) and future hydration modules can go SQS→worker per the mandated architecture.

**Already done by supervisor (do NOT redo):**
- `@aws-sdk/client-sqs` landed on dev (backend/package.json + lockfile, commit 9401837). Don't
  re-add it (avoid a dup PR like the bedrock #17).

**Your work (infra agent):**
1. Extend `backend/scripts/build-lambda.mjs`: mirror the routes-barrel codegen for hydration —
   discover modules shipping `hydration.manifest.ts`, generate
   `backend/lambda/generated/hydration-manifests.ts` (static imports), fail loudly on duplicate
   message `type`. Read `backend/modules/college-hub/hydration.manifest.ts` (on feat/college-hub)
   to match the export contract exactly.
2. `backend/lambda/hydration.ts`: import the generated barrel and populate `hydrationRegistry`
   at load. Keep batchSize-1 / reportBatchItemFailures / DLQ behavior.
3. Tests: registry populated from manifests; duplicate type fails build. Verify live on staging
   (`--profile wnu`, 010928187255): enqueue a college-hub-typed test message → worker dispatches it
   (not "no handler — draining"), DLQ empty.
4. Boundaries: only build-lambda.mjs, lambda/hydration.ts (+ generated), and the (already-added)
   dep. Do NOT edit module handlers. Branch feat/hydration-bundle, draft PR → dev. Supervisor merges.

After merge: the college-hub worker flips its enqueue path inline→`makeSqsEnqueuer()` (one line),
making #19 spec-compliant async → mergeable → unblocks course-planner's prereq matrix.

Account guard: confirm `aws sts get-caller-identity --profile wnu` == 010928187255 before any AWS.

---

## infrastructure agent @ 2026-06-06 — DONE (PR #23, ready, live-proven on staging)

Branch `feat/hydration-bundle` → **PR #23** (ready) into dev. Account confirmed 010928187255 before AWS.

**Implemented (boundaries respected — only build-lambda.mjs, lambda/hydration.ts + generated barrel, new test):**
- `build-lambda.mjs`: generalized `findModules(basename)`; added hydration codegen mirroring routes →
  generates `backend/lambda/generated/hydration-manifests.ts` (static imports of each module's
  `export const hydration = { type, handler }`). Empty-but-valid-TS until a module hydrates.
- `lambda/hydration.ts`: `buildRegistry()` assembles `type→handler` at load, **throws on duplicate
  type** (mirror of collectRoutes). Handler extracted to `makeHandler(registry)` (testable).
- `lambda/hydration.test.ts`: 8 tests (populate, duplicate-throws, dispatch, drain-unknown,
  retry-on-throw, malformed-JSON).
- `@aws-sdk/client-sqs` already on dev (9401837) — not re-added. No CDK change.

**Gates:** typecheck ✅ · lint ✅ · check:routes ✅ (32 routes) · 377 tests ✅ · CI green on #23.

**LIVE PROOF (staging, wnu 010928187255):** a temporary uncommitted probe module
(`type=probe-hydrate`) proved the whole chain — build globbed it → barrel → esbuild bundled the
handler into the worker (CodeSize 1085→1368B) → deployed `KeirasJourney-Async-staging` → a real SQS
message to `keiras-journey-staging-hydration` was **DISPATCHED**:
`PROBE-DISPATCHED {"type":"probe-hydrate","marker":"PROBE-LIVE-7731",...}` in the worker log (NOT
"no handler — draining"); **DLQ depth 0**. Probe reverted; worker redeployed CLEAN (empty registry,
matches dev) — staging worker now reflects exactly what PR #23 ships.

**→ college-hub (#19):** the worker side is ready. On #23 merge, flip your enqueue path
inline→`makeSqsEnqueuer()` (one line); your `hydration.manifest.ts` (`{ type: 'college-hydrate',
handler }`) will be globbed into the worker by the next build and dispatched by `type` with zero
handler/test changes — exact same path the probe proved.

**Note (not fixed here — out of scope):** the committed routes barrel
`backend/lambda/generated/manifests.ts` on dev is STALE (lists only activity-journal; dev has 5 route
modules). Harmless — the deploy's presynth/predeploy regenerates it fresh before bundling, so the
deployed api Lambda has all routes — but a future PR (or whoever adds the next module) should
regenerate+commit it so it reflects reality.

I do not merge — PR #23 ready for spec-reviewer → supervisor.
