# Admin invite links that actually work end to end — design (2026-09-01)

## Problem (Grahem's report, prod)

1. As the platform admin there is nowhere in the app to create an invite for a *new* family —
   only the per-family invites on the Family page (co-parent / student into MY family).
2. An invite link "takes you right to login" instead of a sign-up page.
3. The login page should tell people without an account to reach out to Grahem for an invite link.

## Root causes

- **(1) is a data gap, not a code gap.** The Invites console (`/admin/invites`) and its API are gated
  on the `custom:platformAdmin` Cognito claim. On **staging** `grahem` has `custom:platformAdmin=true`;
  on **prod** (`us-east-2_GHoBLMiBd`) no user has it. The nav entry and route are therefore hidden and
  `POST /admin/invites` would 403. Fix: set the attribute on the prod admin user (mirrors staging).
- **(2)** The `/join?code=` page exists in prod, but it is a bare form with no notion of "you already
  have an account": a signed-in visitor sees the form anyway; an existing email gets a toast and a dead
  end; success bounces to the landing page (`/`) rather than sign-in; nothing links to sign-in. The
  emailed-invite `/redeem` link was already fixed in #202.
- **(3)** Copy only.

## Design

### Prod data fix (no deploy)
`admin-update-user-attributes` on prod user `grahem`: `custom:platformAdmin=true`. Grahem signs out and
back in to pick up the claim. This alone restores the Invites console + Usage page in prod.

### `/join` (JoinPage) — the invite landing page is a sign-up page
- While auth state is resolving: spinner (no flicker between "form" and "already signed in").
- **Already signed in** (a valid session in this browser): instead of the form, a notice —
  "You're already signed in as *username*. Invite links create a new family account." with
  **Go to the app** (`/`) and **Sign out to use this invite** (signs out, then shows the form).
- **Form** (signed out): heading *Create your account*; invite code (prefilled from `?code=`), email,
  family name (optional), password. Under the button: *Already have an account? Sign in* → `/login`.
- **Already registered** (backend 409 `conflict` — Cognito `UsernameExistsException`, the only way to
  know without a user-enumeration endpoint): remember the email as a one-shot login hint, toast
  "You already have an account — sign in instead.", navigate to `/login` (username prefilled).
- **Success**: sign in straight away with the chosen credentials (same pattern as `JoinFamilyPage`:
  `startSignIn` → `replaceState("/")` → `refresh()`), so the family lands in onboarding without
  retyping anything. If auto sign-in doesn't complete, fall back to *Your account is ready* with a
  **Go to sign in** button → `/login` with the email prefilled.

### `/login` (LoginPage)
- Replace the invite-only line with: **Don't have an account? Reach out to Grahem for an invite link.**
- Prefill the username from the one-shot hint (set by `/join`), then clear the hint.

### Login hint (`shared/shell/loginHint.ts`)
Two functions over `sessionStorage` (try/catch — private mode may throw): `rememberLoginHint(username)`
and `takeLoginHint()` (read + clear). Keeps the email out of the URL.

### Admin Invites console
- After minting a link-only invite, show the link **inline** in the create card with its own **Copy**
  button (a direct user gesture). The existing auto-copy-to-clipboard stays, but on iOS Safari a
  clipboard write after an `await` can be refused, and a toast is not a place to recover a link from.

### Out of scope
- Backend: no changes (409 is already returned for an existing email; `APP_URL` is per-env in CDK).
- Landing page copy, the retired `/signup` notice, family (co-parent/student) invites.

## Testing
- `JoinPage.test.tsx` (jsdom): signed-in notice; 409 → hint + `/login`; success → auto sign-in;
  sign-in link present.
- `LoginPage.test.tsx` (jsdom): new copy; username prefilled from the hint and the hint cleared.
- `AdminInvitesPage.test.tsx`: inline link + Copy after a link-only create.
- `loginHint.test.ts`: remember/take round trip, take clears.
- Staging: mint a link as a platform admin, open it signed out → sign-up form; open it signed in →
  notice; redeem with an existing email → lands on `/login` prefilled.

## Rollout
Code → PR into `dev` → staging auto-deploy → verified. Prod code promotion (`dev→main`) waits for
Grahem's explicit go. The prod Cognito attribute is applied immediately (reversible, admin's own account).
