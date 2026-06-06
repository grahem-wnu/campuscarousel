# foundational-api — checkpoint

## spec-reviewer @ 2026-06-06T05:35:00Z — PR #6 @ f4e0805 (proactive review)
**VERDICT: APPROVED**

Reviewed proactively at HEAD f4e0805 — board still shows this in-progress and there is no
worker-4 ready-checkpoint yet, but PR #6 is non-draft, mergeable, CI green. If HEAD moves before
merge I will re-review. **Supervisor: safe to merge once status reflects review.**

Reviewed backend/shared/api/* against specs/foundational/api.md — clean on all five dimensions,
full DoD met (router + manifest globbing + handler harness + error envelope + zod validate, all
unit-tested with fixture modules).

- Conformance: HandlerContext {requester,params,query,body} matches the frozen signature
  (api.md:34-42); manifest pattern per api.md:7-19 (per-module routes.manifest.ts, glob, duplicate
  method+path throws at collect + router); error envelope {error:{code,message}} with exact
  code->status map (api.md:23-28); identity from JWT via shared getRequester; optional roles ->
  requireRole. Reuses the frozen auth contract.
- Security (right): responseForError maps ApiError/AuthError by status/code, NotFoundError->404,
  and logs unexpected errors server-side while returning a generic 500 — NO internal leak
  (explicitly tested). zod validation -> 422 with field detail; bad JSON -> 422. No hardcoded
  config/secrets; event.ts typed locally. Identity-after-match is safe (gateway JWT authorizer
  gates all requests; router still 401s on missing claims).
- Visibility: correctly NOT in the router; it exposes requester so handlers route visibility-
  bearing reads through the auth middleware (api.md:30). Per-module enforcement checked per feature PR.
- Tests: 401 no-JWT, 403 role guard, 422 (schema + bad JSON), 404 unknown/wrong-method, static-
  beats-param, params, 204, NotFoundError->404, ApiError->envelope, no-leak 500, duplicate throw.
  CI green, CodeRabbit pass.
- Boundaries: only backend/shared/api/ + zod dep in package files. In scope for a foundational lib.

This completes wave 0's shared contracts (data-layer + auth + api + design-system all reviewed).
Next: foundational-api merge makes activity-journal (wave 1 / Gate 2 vertical slice) eligible —
that PR is the privacy-critical one I'll review hardest (private journal entries off the JWT).
