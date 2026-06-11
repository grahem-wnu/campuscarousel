# Keira's Journey → Multi-Tenant SaaS — Platform Design

**Date:** 2026-06-10 · **Status:** Draft — full-platform design (build-all, launch invite-only)

## Decision summary

Productize the single-family app into a **commercial multi-tenant SaaS**, evolving the existing codebase
in place. Locked decisions:
- **Tenant = family**, parent-owned, one student per family. Maps onto existing `admin`/`parent`/`student`
  roles. (Grahem is the **platform super-admin**, distinct from a family's `admin`/parent.)
- **Isolation** via tenant-prefixed keys + `AsyncLocalStorage` at the `TableClient` seam — see the detailed
  sub-spec: `spec/platform/2026-06-10-tenancy-and-data-isolation-design.md` (reviewed/approved). That is
  the foundation and is authoritative for sub-project 1.
- **Launch model: invite-only + free, behind a flag.** Build the full platform — including Stripe billing
  and public paid signup — but ship them **dark** (`PUBLIC_SIGNUP_ENABLED=false`, `BILLING_ENABLED=false`).
  v1 onboards a controlled cohort via admin-issued free invites. This is the de-risking lever for both
  payments and minors'-PII/compliance exposure.
- **Minors' PII → COPPA/FERPA is a launch gate** (real legal pass before public/paid go-live; invite-only
  free cohort does not require collecting payment and lets a parent consent at redemption).

## Roles (platform vs family)

- **`super-admin`** (Grahem) — platform owner. Manages the tenant registry, issues invites, support/ops.
  A new role *outside* the per-tenant role model; identified by a `custom:platformAdmin=true` claim (NOT a
  family membership). Super-admin endpoints live under `/admin/*` and are the only routes allowed to use
  the un-scoped base client (via an explicit, audited path).
- Within a family: **`admin`/`parent`** (account owner, billing, consents, manages members) and
  **`student`** (Keira-equivalent) — unchanged behavior, now scoped to their tenant.

## Sub-projects & build order

Dependency-ordered; built end-to-end without per-step approval pauses. The isolation proof (1) gates all.

### 1. Tenancy & data isolation — FOUNDATION
Per the dedicated sub-spec. Deliverable: provable two-tenant isolation + CI guard. Manual provisioning
only (the invite/auth subsystem in #2 replaces manual provisioning).

### 2. Auth, invites & account lifecycle
**Invite subsystem (the v1 front door):**
- `Invite` — global record (like the tenant registry, written via the audited base-client path):
  `PK: INVITE#<code>`, `SK: DETAILS`; fields: `code` (random, URL-safe, single-use), `email`,
  `familyName?`, `plan: 'free'` (comp), `status` (`pending`|`accepted`|`revoked`|`expired`), `invitedBy`
  (super-admin), `expiresAt`, `acceptedTenantId?`, timestamps. Enumerable via a `GSI1PK='INVITES'`
  collection (un-prefixed, base client).
- `POST /admin/invites` (super-admin only) → create invite + send email via the **existing shared SES
  sender** (`backend/shared/email`): subject "You're invited to Keira's Journey", body with the code + a
  signup link `https://app/redeem?code=<code>`. `GET /admin/invites` (list), `POST /admin/invites/:code/revoke`.
- **Redemption / signup:** `POST /auth/redeem` — validates the code (pending + unexpired), runs the parent
  through Cognito sign-up (email + password), **provisions the tenant** (creates `TENANT#<id>` on the
  `free` plan, captures parental-consent flags), sets the parent's `custom:tenantId` + `custom:role=parent`,
  marks the invite `accepted`. The parent then adds the student (and optional co-parent) from within the app.
- **Public paid signup** (`POST /auth/signup`) — same provisioning path minus the invite, **gated by
  `PUBLIC_SIGNUP_ENABLED`** (dark in v1). When enabled, routes new tenants into the billing trial.

**Cognito changes:** single user pool, switch the family-app's username login to **email-based** sign-in;
add self sign-up (email verification), password reset, custom attributes `tenantId`, `role`, and pool-level
`platformAdmin`. A `PostConfirmation`/pre-token Lambda stamps tenant/role claims. Existing 3 users migrate
to tenant #1 with `custom:tenantId` set (see migration in the tenancy sub-spec).

**Member management:** `POST /family/members` (parent invites co-parent or creates the student sub-user
within their tenant); role-gated; tenant-scoped.

### 3. Billing & entitlements (Stripe) — built, flagged dark
- Stripe Checkout + Customer Portal; `Subscription`/`plan` on the tenant; webhook Lambda
  (`/webhooks/stripe`) updates tenant `plan`/`status`. Plans: `free` (invite comp), `family` (paid).
- **Entitlements** as a small policy module: `entitlementsFor(tenant)` → feature/limits map; a
  `requireEntitlement(feature)` guard for gated routes. Free-invite tenants get full features, no payment.
- All Stripe paths gated by `BILLING_ENABLED`; with it off, every tenant behaves as `free`.
- Dunning/trial-expiry → tenant `status` transitions (`active`/`past_due`/`suspended`); the
  `requireActiveTenant()` hook (stubbed no-op in #1) becomes live here.

### 4. Per-tenant AI cost controls & abuse protection
- Per-tenant usage metering for Bedrock + Tavily (count + token/$ estimate) written under the tenant's
  keys; a monthly quota per plan; `checkAiBudget(tenant)` guard before AI calls (chat, hydration,
  discovery, benchmarks, study plans, mock interviews). Over quota → friendly 429 + upgrade hint.
- Per-tenant rate limiting on AI endpoints (token bucket). Protects margins + prevents abuse. Without this,
  N tenants × unbounded Bedrock spend = uncapped bill. **Required before public/paid go-live.**

### 5. Admin / ops console (super-admin)
- `/admin/*` (super-admin only): invite management (issue/list/revoke), tenant list + detail + status
  (suspend/reactivate), per-tenant usage, **data export + hard delete** (`DELETE /admin/tenants/:id` →
  full per-tenant DynamoDB + S3 purge; the compliance "delete my family's data" capability).
- A minimal admin UI in the frontend, gated to `platformAdmin`.

### 6. Funnel / public surface (minimal for invite-only v1)
- A public **landing page** + **`/redeem`** page (enter code → signup) + pricing page (shown only when
  `PUBLIC_SIGNUP_ENABLED`). Invite-only v1 needs only landing + redeem; the rest ships behind the flag.

## Cross-cutting

- **Feature flags:** `PUBLIC_SIGNUP_ENABLED`, `BILLING_ENABLED` (env/SSM), read in one `flags` module;
  default **off**. Lets us ship the whole platform and launch invite-only safely.
- **Compliance hooks:** capture parental-consent (timestamp + ToS/privacy version) at redemption/signup on
  the `Tenant`; hard-delete + export implemented in #5; these make a future legal pass enforceable, not
  retrofitted. (Actual ToS/Privacy/DPA + legal review are non-code, gating public/paid launch.)
- **Observability:** per-tenant tagging on logs/metrics; super-admin dashboard counts.
- **Auth contract:** `Requester` gains `tenantId` + `platformAdmin`; `getRequester` reads both; router
  enforces tenant context (and `platformAdmin` for `/admin/*`, which run via the audited base-client path).

## Build sequence (one continuous effort)

1. **Tenancy foundation + isolation proof + CI guard** (sub-spec #1). Migrate Keira → tenant #1. *Gate.*
2. **Auth + invites:** Cognito email/self-signup, super-admin claim, `Invite` entity, `/admin/invites`,
   `/auth/redeem`, member management; public `/auth/signup` behind `PUBLIC_SIGNUP_ENABLED`.
3. **Admin console** (super-admin UI: invites, tenants, usage, export/delete).
4. **AI quotas + rate limits** (per-tenant metering + guards) — before any public/paid thought.
5. **Billing (Stripe)**, fully behind `BILLING_ENABLED`; entitlements + `requireActiveTenant` live.
6. **Funnel:** landing + `/redeem`; pricing behind the public-signup flag.
7. **Hardening:** end-to-end multi-tenant tests, per-tenant load/cost sanity, security pass (CSO skill).

## Risks / guardrails (stated plainly)

- **Isolation correctness is existential** — a leak exposes another family's child's data. The #1 proof +
  CI guard + fail-closed ALS are non-negotiable; nothing ships on top until that's green.
- **Don't flip `PUBLIC_SIGNUP_ENABLED` / `BILLING_ENABLED` for real outside families until:** isolation
  proof green, AI quotas live, and a real COPPA/FERPA + ToS/Privacy legal pass is done. Invite-only free
  cohort needs none of those flipped.
- **Prod migration** of Keira's live data runs only on explicit go + PITR/S3 snapshot.
- **Scope is genuinely large** — this is multiple subsystems; the implementation plan sequences it so each
  phase is independently testable and the app stays deployable throughout.

## Open questions (non-blocking; defaults chosen)

- Super-admin identity: a Cognito group `platform-admins` → `platformAdmin` claim (default) vs a hardcoded
  allowlist. Default: Cognito group.
- Email-login migration for the existing 3 users: add email attributes + verify (default) vs keep username
  for tenant #1 only. Default: migrate to email.
- Pricing/plan specifics for `family` paid plan — deferred to when billing goes live.

---
*Author: Grahem + Claude. Full-platform design; tenancy detail in the companion sub-spec.*
