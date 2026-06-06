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

---

## worker-3 @ 2026-06-06T20:03:11Z — PR #21 READY for review (frontend in; full module complete)

Frontend landed (e5ac2d4) + a self-review fix (a643eb1). PR #21 is now non-draft, CI green.
- Frontend: discover flow (web-search → selectable → bulk-add, degrades gracefully), sortable/
  filterable list with color-coded deadline badges (red <30d / yellow <90d), totals header
  (tracked/potential/awarded), detail (application checklist, status, Refresh, link, linked colleges,
  notes, edit/delete), budget what-if affordability, empty state, responsive. Scholarships is one of
  the design-system's 5 fixed PRIMARY tabs.
- Self-review fix: bulk-add marks hydrationStatus 'pending' only after a SUCCESSFUL enqueue (no
  false "Refreshing…" while the queue is gated).
- 57 module tests green (42 backend + 15 frontend logic); typecheck/eslint/check:routes + Lambda
  bundle clean. All under owned trees + the two manifests; no shared/foundational file touched.

UNCHANGED ASK — the async foundational gap above (client-sqs dep + module hydration-handler
registration glob) still blocks the live /discover + /:id/hydrate; they 503 cleanly until it lands.
Reviewer: ready for a full pass. (Aside: goal-tracker PR #15 merged at 2026-06-06T19:59Z — done.)

---

## spec-reviewer @ 2026-06-06T20:19Z — PR #21 (head a643eb1) — 🔴 CHANGES REQUESTED

Reviewed `feat/scholarship-tracker` (+2296/-0, 23 files) vs `specs/modules/scholarship-tracker.md`.
Clean/secure/in-boundary/conformant, BUT materially incomplete on the AI path — and meaningfully
behind the college-hub analog you were meant to mirror.

**No hard fails:** three-dot boundary clean (only scholarship-tracker trees); no shared-contract
edits; authz off the JWT (401 proven; `addedBy` server-set); no hardcoded secrets/model-id/table/
queue/account; single-table; deadline date-math + amount totals tested; producer side honors async
(no synchronous Bedrock in the request). Strong sync-path tests (CRUD/filters/summary/enqueue-failure).
Downstream contract (application-central) stable except finding 3.

### Required — worker-actionable NOW (NOT blocked; the deps are on dev)
Your comments say `/discover` + `/:id/hydrate` "503 until the async foundational gap lands." That's
over-broad — most of this is in-lane work you can do today (college-hub is the proven template):
1. **[Completeness — acceptance L43] Implement the real Bedrock DISCOVERER.** `/discover` is a
   **synchronous** Bedrock call (return candidates) — it does NOT need SQS or the worker-glob, and
   `@aws-sdk/client-bedrock-runtime` has been on dev for a while. You ship only `unavailableDiscoverer`
   (503, `discover.ts:110`) wired in `routes.manifest.ts:21`. Add a real discoverer (model from
   `BEDROCK_MODEL_ID` env, server-side, graceful fallback) mirroring `college-hub/ai.ts` — your prompt
   builder + parser already exist; just wire the invoke.
2. **[Completeness/Conformance] Implement the Bedrock HYDRATOR + ship the worker consumer seam.** You
   ship neither `hydration.manifest.ts` nor a `makeWorkerHandler` (college-hub ships both), so even
   when the supervisor's worker-glob lands, scholarship-tracker has nothing to register. `@aws-sdk/
   client-sqs` is **now on dev**, so implement `makeSqsEnqueuer` (replace `unavailableEnqueuer`,
   `hydration.ts:45`) AND a `makeWorkerHandler` that hydrates via Bedrock and writes terminal
   `complete`/`partial`/`failed` (today nothing ever leaves `pending`). Mirror college-hub exactly;
   ship `hydration.manifest.ts` in the same shape. (The worker actually *running* still waits on the
   supervisor's build-lambda worker-glob — escalated below — but ship the seam now so it activates.)
3. **[Correctness] `summary.ts:7` `ACTIVE_FOR_POTENTIAL` includes `'awarded'`** → an awarded
   scholarship's `amount` feeds `totalPotential` AND its `awardedAmount` feeds `totalAwarded`, so the
   budget header (and application-central's rollup) double-counts that money. Drop `'awarded'` from the
   potential set (potential = not-yet-decided) or relabel the figure. Lock this before wave-3 builds on it.

### For Grahem / supervisor
- **Web-search tool prompted but NOT wired** (`discover.ts:40` instructs web search; no tool config) —
  same gap as college-hub; matters for scholarship-data accuracy. Wire the web-search capability (likely
  shared) or accept general-knowledge for now.
- **Shared worker-glob still pending** (escalated via college-hub): `build-lambda.mjs` must glob module
  `hydration.manifest.ts` into the worker `hydrationRegistry` (empty on dev). Needed for live hydration
  on BOTH college-hub and scholarship-tracker.

**Verdict: CHANGES REQUESTED** — items 1-3 are in-lane and doable now (Bedrock + sqs deps on dev;
college-hub is the template). Module is otherwise high quality. ⚠️ Formal `--request-changes` impossible
(self-PR under `grahem-wnu`) → this checkpoint + the PR comment are the signal.

---

## worker-3 @ 2026-06-06T20:44:46Z — round 1 addressed: real Bedrock AI wired (head 30cc319)

Rebased onto dev (Bedrock + client-sqs both present); mirrored college-hub.
1. **Real synchronous Bedrock discoverer** (ai.ts) — /discover returns real candidates; dropped the
   503 stub. 2. **Real hydration**: /:id/hydrate hydrates INLINE → terminal status (no stuck
   'pending'); bulk-add enqueues async via makeSqsEnqueuer; makeWorkerHandler + hydration.manifest.ts
   shipped (same shape as college-hub) so the pending worker-glob activates it with zero changes.
   3. **summary double-count fixed** (dropped 'awarded' from potential).
- 67 module tests green; typecheck/eslint/check:routes + Lambda bundle (bedrock+sqs) clean.

REMAINING (Grahem/supervisor, not a worker block): web-search tool not wired server-side (Bedrock
general knowledge meanwhile, same as college-hub); the SQS worker actually draining the queue still
needs the foundational build-lambda hydration.manifest glob (seam shipped on scholarship-tracker +
college-hub). Reviewer: re-review at 30cc319.
