# Public Self-Serve Sign-Up

**Tier**: 3 (new public endpoint + new UI page, cross-cutting FE/BE/infra)
**Date**: 2026-07-04
**Status**: Approved (Grahem, 2026-07-04)

## Summary

Let anyone with the site URL create their own family account — no admin invite, no email
verification (for now). Grahem can send someone a link to the staging site and they sign up
themselves. This is the `POST /auth/signup` path the SaaS platform design already anticipated
(`spec/platform/2026-06-10-saas-platform-design.md` §2, "Public paid signup … gated by
`PUBLIC_SIGNUP_ENABLED`"), minus billing: new signups land on the `free` plan.

Decisions made with Grahem (2026-07-04):
- **Fully open** `/signup` page, discoverable via a link on the login page. `PUBLIC_SIGNUP_ENABLED`
  env flag is the kill switch (on by default).
- A new signup becomes a **parent owning a brand-new tenant** — identical to invite redemption.
  The existing onboarding chat auto-triggers because the new tenant's student roster is empty.
- **Staging only** for now; prod promotion is a separate explicit step.

## Approach

Reuse the invite-redemption machinery, minus the invite. The existing public `RedeemFn` Lambda
already has exactly the IAM this needs (`AdminCreateUser` + `AdminSetUserPassword` on the pool,
table R/W), so the new public `POST /auth/signup` route points at the **same Lambda**, which
dispatches on the request path. No new function, no new IAM, no Cognito CDK changes
(`selfSignUpEnabled` stays `false` — provisioning goes through the admin APIs, same as redeem).

Rejected alternative: a separate `SignupFn` Lambda — duplicate bundle/IAM/log group for a handler
that shares every dependency with redeem. Not worth it at this scale.

## Changes

| File | Change |
|------|--------|
| `backend/modules/invites/schema.ts` | Add `signupSchema` = `{email, password (min 8), familyName?}` (redeem schema minus `code`) |
| `backend/modules/invites/signup.ts` (new) | `publicSignup(deps, input)`: create tenant (`plan: 'free'`, `status: 'active'`, consent stamp) → `provisioner.createParentUser(...)`. Same `TenantProvisioner` seam as redeem so it unit-tests without AWS. Throws 403 `Errors.forbidden` when `signupEnabled` dep is false. |
| `backend/modules/invites/signup.test.ts` (new) | Unit tests (see Test Plan) |
| `backend/lambda/redeem.ts` | Dispatch on `event.rawPath`: `/auth/signup` → `publicSignup` (reads `PUBLIC_SIGNUP_ENABLED`), else existing redeem. Update header comment: this is the public-auth Lambda, two routes. |
| `infra/lib/api-stack.ts` | Add public `POST /auth/signup` route → existing `RedeemFn` integration; add `PUBLIC_SIGNUP_ENABLED: "true"` to its environment |
| `frontend/src/shared/shell/SignupPage.tsx` (new) | Public page: email / family name (optional) / password → `POST /auth/signup`. On success, auto sign-in via `startSignIn(email, password)` and reload into the app (onboarding chat takes over); if auto sign-in fails, fall back to the "go to sign in" screen like JoinPage. |
| `frontend/src/shared/shell/AuthGate.tsx` | Render `SignupPage` for paths starting with `/signup` (same pattern as `/join`) |
| `frontend/src/shared/shell/LoginPage.tsx` | Add "New here? Create an account" link → `/signup` |

## API Contract

### `POST /auth/signup` (public — no authorizer)
**Request**: `{ email: string (valid email, ≤320), password: string (8–256), familyName: string (required, trimmed, 1–120) }` (strict)
> `familyName` became **required** on 2026-07-21: an optional field produced a real prod tenant
> literally named "Family" (the default), indistinguishable on the admin Usage page. Open signup has
> no invite record to fall back on, so the name must come from the form.
**Response**: `201 { tenantId }`
**Errors**:
- `403 forbidden` — `PUBLIC_SIGNUP_ENABLED` is not `"true"` ("Sign-up is currently closed.")
- `409 conflict` — email already has an account (`EmailTakenError`, same as redeem)
- `422 validation` — bad body / invalid JSON

## Data Model

No new item types. Creates one **Tenant** (`PK: TENANT#<newId>`, `SK: DETAILS`) with
`familyName` (default `"Family"`), `plan: 'free'`, `status: 'active'`,
`consent: { acceptedAt, byEmail }` — and one Cognito user (Username = email,
`custom:role=parent`, `custom:tenantId`, permanent password, `MessageAction: SUPPRESS`).

## Business Logic

- Order matches redeem: tenant first, then Cognito user. If provisioning throws, the orphan
  tenant is admin-cleanable (documented, accepted — same as redeem).
- No email verification: the address is taken at face value (Grahem's explicit call, "for now").
  Password reset remains admin-mediated, so a typo'd email just means a dead login.
- Kill switch: flip `PUBLIC_SIGNUP_ENABLED` to `"false"` in `api-stack.ts` + deploy. Frontend
  surfaces the 403 message; the `/signup` page stays reachable but unusable.
- Abuse posture (accepted for a staging-only, unadvertised URL): API Gateway default throttling
  only. Revisit (CAPTCHA/rate limit) before prod/public launch — the platform spec's COPPA/FERPA
  gate applies there too.

## Edge Cases & Error Handling

- Email already registered → 409, page shows "An account with that email already exists."
- Signup disabled → 403 message shown inline.
- Auto sign-in after signup fails (transient) → account exists; show "go to sign in" fallback.
- Duplicate submit (double-tap) → second call hits 409; page already disables the button while submitting.
- New tenant sees zero data (tenant isolation) and lands in the onboarding chat (empty roster → LOOP mode). Verified manually.

## Acceptance Criteria

- [ ] Visiting `/signup` on staging without any session shows the sign-up page
- [ ] Submitting valid email+password creates a Cognito user + new tenant and lands the user in the app, in the onboarding chat
- [ ] The new account sees no data from any other family (spot-check isolation)
- [ ] Re-using an existing email shows the 409 message
- [ ] Login page links to `/signup`
- [ ] Setting `PUBLIC_SIGNUP_ENABLED=false` makes the endpoint return 403 (unit-tested; env flip not deployed)
- [ ] `/auth/redeem` (invite flow) still works — regression-checked by existing tests
- [ ] Typecheck, lint, and full test suite green

## Test Plan

- **Unit (backend)**: `publicSignup` creates tenant with free plan + consent then provisions user
  (order asserted); 403 when disabled; provisioner failure leaves no invite-state side effects;
  `signupSchema` rejects missing/short password, bad email, unknown keys. Lambda dispatch: rawPath
  routing to signup vs redeem, 409/422 mapping (mirrors existing redeem tests).
- **Unit (frontend)**: `SignupPage` (jsdom) — validation message, posts to `/auth/signup`,
  409 surfaces error, success path calls `startSignIn`.
- **Manual QA (staging)**: full walkthrough of Acceptance Criteria with a throwaway email;
  confirm onboarding chat fires; confirm invite `/join` flow untouched.
