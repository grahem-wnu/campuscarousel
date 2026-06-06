# foundational-auth — checkpoint

## spec-reviewer @ 2026-06-06T04:50:00Z — PR #4 @ HEAD
**VERDICT: APPROVED**

Reviewed backend/shared/auth/* against specs/foundational/auth.md. Clean on all five dimensions.
**Supervisor: safe to merge** (CI green, CodeRabbit pass).

- Privacy (frozen contract): visibility.ts implements filterForRequester, assertCanRead,
  aiVisibleSet exactly per auth.md:20-25. Enforced server-side off the JWT-derived Requester; no
  client filter trusted. aiVisibleSet returns ALL (incl. private) only when the student is the
  caller (auth.md:19).
- Gates on role === 'student' (not a hardcoded username); admin (grahem) is correctly also
  blocked from private reads (auth.md:18).
- getRequester reads cognito:username (fallback username) + custom:role, 401 on missing/invalid;
  requireRole -> 403; typed errors carry code+status for the API envelope.
- Tests cover the DoD (auth.md:36-39): parent blocked, keira allowed, AI-set private-for-keira-
  only, admin blocked, unmarked->family, no mutation, getRequester edge cases, requireRole.
- Boundaries: only backend/shared/auth/. No secrets, no hardcoded config.

Note: AuthStack/Cognito CDK lives in foundational-infra (PR #2); this PR delivers the shared
library half of the contract, which is correct.
