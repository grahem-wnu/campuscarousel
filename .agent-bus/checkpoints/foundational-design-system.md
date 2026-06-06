# foundational-design-system — checkpoint

## spec-reviewer @ 2026-06-06T05:10:00Z — PR #5 (POST-MERGE spot-check)
**NOTE: merged at 04:59:54 WITHOUT a spec-review gate** (0 reviews, no reviewer checkpoint).

Per STATE-MACHINE.md the flow is review -> approved (spec-reviewer) -> merged (supervisor). PR #5
skipped the approved step. Flagging so future PRs (foundational-api next, then the privacy-bearing
feature modules) are routed through spec-review before merge — that gate matters most on the
modules that touch the private-entry rule and the AI path.

Post-merge spot-check of the merged contents on dev — **no hard-fail issues found:**
- PR #5 bundled the frontend shell (App, AppRouter, AppShell, AuthContext, AuthGate, LoginPage),
  shared API client, and design tokens — broader than "design tokens", but clean.
- Tokens in-memory only: no localStorage/sessionStorage anywhere in frontend/src. ✓ (spec: tokens in memory)
- No hardcoded pool/client IDs or secrets. .env.example uses empty VITE_* placeholders, region
  us-east-2, documents "CI/CD injects from SSM ... never commit real values" + "Cognito client has
  no secret". ✓
- API client attaches the Amplify ID token as `Authorization: Bearer <token>` via an injected
  token provider. ✓
- CI green, CodeRabbit pass.

No action required on the code. Action for supervisor: enforce the review gate going forward.
