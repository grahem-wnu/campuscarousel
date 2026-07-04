# Pay-Worthy Polish — first-impression reliability + landing page

**Date**: 2026-07-04
**Status**: Approved (Grahem delegated: "I trust you to upgrade it… get it to a spot where I can consider adding stripe")
**Origin**: 2026-07-04 design review of staging (grade A-). This wave fixes the trust/reliability
gaps that stood between the product and "people would pay for this", and adds the public storefront
that a future Stripe funnel plugs into. Explicitly OUT of scope: any payment/billing feature.

## Summary

Six changes, one theme — the first session must feel dependable:

1. **Chunk-load recovery.** After every deploy, a returning browser holds an index.html whose lazy
   chunks no longer exist; the failed dynamic import white-screens the app (observed live on
   staging: `GuidedTour-C9Zt0DIW.js` served as text/html → blank page right after login). Fix:
   auto-reload once, then a friendly fallback.
2. **Readiness label.** Dashboard badge prints the raw enum (`insufficient-data`). Fix: human labels.
3. **Named colleges get seeded.** A parent who says "she's interested in Cedarville" never sees
   Cedarville in the seeded list (the chat's extracted profile has no colleges field; the seeder only
   gets majors + location). Fix: capture `collegesOfInterest` in the chat → review form → profile →
   seeder must-include list.
4. **Setup progress that survives.** `SetupProgressBanner` state dies when `onboarding-finished`
   flips DashboardPage into its full-page spinner (the banner unmounts mid-event); on remount the
   colleges list is still empty so the banner hides forever, and the dashboard stats (Budget,
   Colleges (N), deadlines) stay stale until a manual reload. Fix: persist the just-onboarded flag in
   sessionStorage; banner polling notifies the page to quiet-refetch as the seed lands.
5. **Public landing page.** Signed-out visitors to `/` see a sign-in form with zero product story.
   Fix: a marketing landing page (Field Notes aesthetic) funneling into the existing `/signup`
   (PR #161) and sign-in. This is the surface a Stripe checkout later attaches to.
6. **SaaS copy hygiene.** "Password help? Ask Grahem" (login) and "the home of the path to a BSN"
   (router welcome) are family-app copy leaking to every new tenant. Genericize.

## Changes

| File | Change |
|------|--------|
| `frontend/src/main.tsx` | `vite:preloadError` listener → reload once (sessionStorage guard) |
| `frontend/src/shared/shell/ChunkErrorBoundary.tsx` | NEW error boundary: chunk-error → auto-reload once, else friendly "reload" card; non-chunk errors rethrow-safe fallback |
| `frontend/src/App.tsx` | Wrap app content in ChunkErrorBoundary |
| `frontend/src/modules/dashboard/logic.ts` | `READINESS_LABEL` map (strong/competitive/needs-work/insufficient-data → human text) |
| `frontend/src/modules/dashboard/DashboardPage.tsx` | Use label map; banner sessionStorage persistence; dispatch/listen `colleges-progress` → quiet refetch |
| `backend/modules/onboarding-chat/ai.ts` | Chat asks about colleges already on the radar; `collegesOfInterest` in OnboardingProfile + JSON contract; `CollegeSeeder` gains `mustInclude` — prompt guarantees named schools appear, fills to 12 |
| `backend/modules/onboarding-chat/schema.ts` | `collegesOfInterest: string[]` (≤15, each ≤120 chars) on finish profile |
| `backend/modules/onboarding-chat/handlers.ts` | `toProfilePatch` maps collegesOfInterest |
| `backend/modules/onboarding-chat/seed.ts` | Pass `profile.collegesOfInterest` to the seeder |
| `backend/shared/data/types.ts` | `StudentProfile.collegesOfInterest?: string[]` |
| `frontend/src/modules/onboarding/api.ts` | Type: collegesOfInterest on OnboardingProfile |
| `frontend/src/modules/onboarding/OnboardingChat.tsx` | ReviewForm "Colleges on the radar" field (comma-separated, like majors) |
| `frontend/src/shared/shell/LandingPage.tsx` | NEW public marketing page |
| `frontend/src/shared/shell/AuthGate.tsx` | Unauthenticated `/` → LandingPage; `/login` → LoginPage explicitly |
| `frontend/src/shared/shell/LoginPage.tsx` | Genericize password-help copy; back-link to landing |
| `frontend/src/shared/shell/AppRouter.tsx` | Genericize Welcome copy (BSN leftover) |

## Business logic

- **Reload-once guard**: `sessionStorage['cc-chunk-reload'] = <ts>`; a second chunk failure within
  60s does NOT reload again (loop protection) — shows the fallback card instead. Guard cleared on
  successful mount.
- **Seeder must-include**: named colleges are deduped against discovery output case-insensitively,
  placed first, capped so total ≤ 12. Seeder prompt instructs the model to include each named school
  exactly (verbatim names pass through even if the model omits them: post-merge, not prompt-trust —
  `mustInclude` entries missing from the model's list are prepended as `{name}` with no state).
- **Landing page honesty**: no pricing, no testimonials, no fake logos. Copy sells what exists:
  chat onboarding, self-building workspace, live college research, focus packs, essay coach,
  family roles + student privacy.
- **AuthGate routing** (unauthenticated): `/join*` → JoinPage, `/signup*` → SignupPage, `/` →
  LandingPage, anything else (deep link) → LoginPage. Authenticated: unchanged (index redirects to
  first primary tab). After sign-in at `/login`, the router's `*` fallback never traps the user:
  LoginPage sign-in leaves the path at `/login` → NotFound; so LandingPage/LoginPage links use
  plain `/` + `history.replaceState` before refresh — simplest: LoginPage replaces the URL to `/`
  after successful sign-in (same trick SignupPage uses, per #161).

## Edge cases

- Chunk error during the reload attempt itself → guard prevents loop; fallback card with manual
  Reload button.
- Family names 15+ colleges → schema caps at 15, seeder caps total at 12 (named first).
- Family names a college the discoverer also suggests → dedupe keeps one.
- Seed job dead (SQS failure) → banner's bounded polling (existing SEED_WAIT_MAX_POLLS) stops; page
  simply stops refetching. No regression.
- sessionStorage unavailable (private mode edge) → try/catch, degrade to current behavior.

## Acceptance criteria

- [ ] Simulated chunk failure (dev tools) auto-reloads once; second consecutive failure shows a
      styled fallback card, not a white page.
- [ ] Dashboard Readiness badge shows "Not enough data yet" (etc.), never a raw enum.
- [ ] Onboarding chat where the family names colleges → those exact names appear in the review form
      and in the seeded college list on /colleges.
- [ ] After finishing onboarding, the dashboard shows the setup banner immediately, and Budget /
      Colleges (N) / deadlines fill in without a manual reload.
- [ ] Signed-out visit to `/` renders the landing page; "Create your account" reaches /signup;
      "Sign in" reaches the login form; signed-in users never see the landing page.
- [ ] No "Grahem" or "BSN" copy reachable by a new tenant.
- [ ] Full suite green: typecheck (BE+FE), all tests, lint, check:routes, check:isolation.

## Test plan

- **Unit**: parseTurn with collegesOfInterest; seeder must-include merge (named-missing-from-model,
  dedupe, cap); toProfilePatch mapping; READINESS_LABEL completeness (one label per Readiness value).
- **Component (jsdom)**: ChunkErrorBoundary (chunk error → reload called once, guard blocks second;
  non-chunk error → fallback); ReviewForm submits collegesOfInterest; SetupProgressBanner survives
  remount via sessionStorage + dispatches progress event; AuthGate renders LandingPage at `/` when
  signed out; LandingPage CTAs.
- **Manual QA (staging, post-deploy)**: fresh signup → onboarding naming an obscure college →
  verify seeding + live dashboard fill-in; signed-out landing page on desktop + mobile.
