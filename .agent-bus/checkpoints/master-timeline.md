# master-timeline — checkpoint

## spec-reviewer @ 2026-06-08T00:25Z — PR #31 (head 0ae7ba4) — 🔴 CHANGES REQUESTED

Reviewed `feat/master-timeline` (+988/-0, 16 files; wave-4 aggregator) vs `specs/modules/master-timeline.md`.
Privacy/boundary/authz/config/cross-module all clean (verified) — two worker-actionable frontend fixes block.

- **PRIVACY ✓ (verified myself):** of the private-capable sources, only `activities` is pulled onto the
  timeline, and it's filtered off the JWT before timeline-build — `handlers.ts:53`
  `activities: filterForRequester(activitiesRaw, requester)` (requester = ctx.requester); `buildEvents`
  consumes the filtered list. **clinical-hours and why-nursing are NOT gathered** (handlers.ts:36-42 lists
  activities/goals/colleges/teas/scholarships/certifications only) → no leak surface. Two-direction
  privacy test (handlers.test.ts:40-50,69,85): a parent timeline + analyze-window EXCLUDE keira's private
  activity ("Private reflection"); keira INCLUDES it. Non-private sources unfiltered (correct). AI path
  gets the already-filtered window.
- **Conformance ✓ (mostly)** — cross-module reads via shared accessors only (no module-code imports);
  three-dot boundary strictly in module trees; single-table; append-only manifests; nav `group:'primary'`
  (correct — Timeline is a design-system primary tab). Bedrock server-side, model from env, curated
  fallback. (BUT see findings 1-2: design-system color-token violations.)
- **Tests ✓** — privacy (both directions) + authz 401/404 + aggregation/merge/sort/upcoming + AI fallback.

### Required — worker-actionable (your lane, frontend)
1. **[Correctness — acceptance] `frontend/src/modules/master-timeline/logic.ts:8` — `activity: 'bg-info-500'`
   is a non-existent color.** The frozen design tokens define only primary/secondary/ink/success/warn/
   error/surface (`shared/design/tokens.ts`) — there is NO `info` scale — so `bg-info-500` compiles to
   nothing and activity dots render UNFILLED, breaking the spec's color-coding ("activities blue"). Fix:
   use an existing scale, e.g. `activity: 'bg-primary-500'` (the blue-green primary). Do NOT add an `info`
   color to the frozen tokens (out of lane).
2. **[Conformance — design-system contract] `logic.ts:12,14` — raw-hex classes `visit: 'bg-[#9b6dff]'`,
   `certification: 'bg-[#e879b9]'`** violate `tokens.ts:7` / design-system.md ("modules use token classes,
   never raw hex"). Fix: map to existing token scales; if genuinely distinct hues are needed, raise with
   the design-system owner — don't ship raw hex.

### For Grahem (scope confirmation)
- The spec's Frontend lists Calendar / horizontal freshman→senior arc ("You are here") / Upcoming. This
  PR ships Calendar + Upcoming but appears to OMIT the 4-year arc view (acceptance lists calendar+timeline+
  upcoming). Confirm whether the arc is in-scope for this PR or deferred.

Non-blocking: N+1 visits fetch (fine at family scale).

**Verdict: CHANGES REQUESTED** — fix items 1-2 (quick frontend token fixes). Privacy/boundary/authz verified
clean. ⚠️ Self-PR under `grahem-wnu` → checkpoint + PR comment are the signal.
