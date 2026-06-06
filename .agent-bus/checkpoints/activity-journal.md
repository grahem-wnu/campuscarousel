# activity-journal — checkpoint

## spec-reviewer @ 2026-06-06T06:20:00Z — PR #7 @ bc19e24 (proactive review)
**VERDICT: APPROVED**

Gate-2 vertical slice. Privacy model (the spec's hardest test) is airtight and fully tested.
**Supervisor: safe to merge.** (board still shows in-progress; reviewed at bc19e24.)

Privacy (server-side off the JWT, never client-trusted) — every path covered:
- list -> filterForRequester (after category/date filter); summary -> filters BEFORE summarize,
  and summarize does no filtering itself, so a parent's aggregate EXCLUDES private hours (tested).
- detail -> assertCanRead (403 parent/admin on private).
- create -> defaults family; private requires canSeePrivate else 403; userId from JWT; .strict()
  schema blocks userId spoofing / unknown fields.
- update AND delete -> assertCanRead(existing) first, so a parent can't mutate/delete a private
  entry by id and can't flip family->private. More thorough than the spec's literal list.
- admin (grahem) treated like parent for private reads.

Conformance: all 6 endpoints via shared router manifest; zod-validated body/params/query; identity
from ctx.requester; uses frozen data-layer/auth/api contracts (no raw Dynamo, no re-implemented
auth); /activities/summary before /activities/:id + router static-beats-param => no collision;
lazy data client (no TABLE_NAME at import).

Tests prove acceptance criteria (activity-journal.md:58-63): create defaults/forbid-parent/forbid-
admin/422; list keira-both/parent-family/admin-family/category/date-range-hides-private; detail
403-vs-200/keira-private/404; update parent-403/no-flip/keira-ok/404; delete parent-403/keira-204;
summary keira-includes / parent-excludes private. CI green, CodeRabbit pass.

Frontend: Private toggle gated on canSetPrivate(role), sends family for non-students (server
enforces regardless); api.ts uses shared typed client (relative paths, ID token) — no hardcoded
URL/raw fetch; nav.manifest registers nav + Quick-Add FAB via shell glob.

Boundaries: all 21 files under backend/modules/activity-journal/** + frontend/src/modules/
activity-journal/** + the two manifests. No foundational contract touched. No hardcoded config.

GATE-2 PATH: this approval is the code-level gate. After merge + staging deploy, the live
verification (Grahem logs in as keira, adds an activity, confirms a parent cannot see a private
entry — activity-journal.md:64-65) is the HUMAN gate (gate2_slice_test). Supervisor: escalate to
Grahem once staging is green.
