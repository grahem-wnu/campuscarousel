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
