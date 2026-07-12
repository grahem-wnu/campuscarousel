# Multi-student per family — design

**Status:** approved-in-principle (Grahem chose "Everything per-child" on 2026-06-11; building under
"best-effort, test everything at once" autonomy). Extends the SaaS tenancy foundation
(`2026-06-10-tenancy-and-data-isolation-design.md`).

## Problem

A family tenant currently holds exactly one student's worth of data. Families have **multiple
children** to track. Grahem chose **"Everything per-child"**: each child has their own complete
dataset; only a few things stay family-level.

Separately: **family admins (parents) must be able to invite/manage users** in their own family —
distinct from the platform-admin invite console (which creates *new* tenants).

## Scoping model — a second tier nested under tenancy

The tenancy foundation prefixes every key with `T#<tenantId>#` via a `tenantScoped` decorator at the
one data-layer seam. We add a **second, nested tier** for per-child data:

```
Global registry   (base client, un-prefixed)         tenants, invites
Family-level       T#<tenantId>#                       students registry, user profiles, reminderSettings
Per-child          T#<tenantId>#S#<studentId>#         everything else
```

- A new `studentScoped(inner)` decorator prefixes `PK` + every `GSI{1..4}PK` with `S#<studentId>#`,
  reading `currentStudentId()` from the ambient context (fail-closed, like `currentTenantId()`).
- Composition: per-child client = `studentScoped(tenantScoped(base))`. `studentScoped` (outer)
  prepends `S#<sid>#` first, then `tenantScoped` (inner) prepends `T#<tid>#`, yielding
  `T#<tid>#S#<sid>#<originalKey>`. Cross-child queries within a family are physically impossible
  (different partitions), exactly as cross-tenant already is.
- 22 modules stay untouched — the change is confined to the data seam + the router + a new module.

### Entity split

- **Family-level** (`tenantScoped` only): the `students` registry (the roster + switcher source),
  `profiles` (per-Cognito-user account profiles — logins are family-wide), `reminderSettings` (the
  weekly digest spans all kids).
- **Per-child** (`studentScoped(tenantScoped)`): activities, clinical, teas, colleges +
  notes/touchpoints/visits/checklist/benchmarks, scholarships, goals, courses, essays,
  certifications, interviews, whyNursing, contacts, applications, recommendations, testScores,
  conversations, budget, studentProfile (the rich academic profile), documents, opportunities,
  finaid, and the transient discovery-job records.

## Active-student selection — request header

The frontend keeps an **active student** (a switcher in the shell). Each API call sends
`X-Student-Id: <studentId>`. The router resolves it and wraps per-child handlers in
`runWithStudent(studentId, …)` *inside* the existing `runWithTenant`. Family-level handlers
(`GET /students`, reminders) ignore it — they only touch `tenantScoped` repos.

Security note: the student id is a **partitioning dimension within the family's own data**, not a
trust boundary — the tenant prefix already isolates families, so a forged/foreign `X-Student-Id`
just yields an empty (non-existent) partition under the caller's own tenant. No cross-tenant risk.

Backward compatibility for cutover: the router falls back to `DEFAULT_STUDENT_ID` (env) when the
header is absent, mirroring `DEFAULT_TENANT_ID`, so the deployed app keeps working between the data
migration and the frontend ship.

## New backend surface

- `Student` entity + `makeStudents` family-level registry repo (PK `STUDENT#<id>`, SK `DETAILS`,
  collection `GSI1PK='STUDENTS'`). Lightweight: `studentId`, `name`, `graduationYear?`, `status`.
- `students` module: `GET /students` (any family role — the switcher needs it), `POST /students`,
  `PATCH /students/:studentId`, `DELETE /students/:studentId` (admin/parent only).
- `family` module: `GET /family/members` + `POST /family/members/invite` — a parent/admin invites a
  **co-parent into the same tenant** (Cognito `adminCreateUser` with `custom:tenantId` = the caller's
  tenant), and lists the family's users. Roles: admin/parent.

## Frontend

- `ActiveStudentProvider`: loads `GET /students` after auth, restores the last-active id from
  `localStorage`, exposes `{ students, activeStudentId, setActiveStudentId }`. The API client sends
  `X-Student-Id` via an injected `getStudentId` provider (same pattern as `getToken`).
- A student **switcher** in the shell header.
- A **Family** page (parent/admin) with two sections: **Children** (add/rename/archive students) and
  **Parents & access** (list members, invite a co-parent).

## Migration

Extend `backend/scripts/migrate-tenant.mjs` with a per-child phase: for tenant `primary`, create the
first `Student` record (the existing child), then re-key every **per-child** item from
`T#primary#<PK>` to `T#primary#S#<studentId>#<PK>` (and the GSIxPK partitions), skipping the
family-level keys (`STUDENT#…`, `USER#…/PROFILE`, `REMINDER_SETTINGS`, the tenant record).
Idempotent + dry-runnable + non-destructive (originals kept until a verified Phase-D cleanup), like
the tenancy migration. `DEFAULT_STUDENT_ID` on the staging Lambda is set to that first student id.

## Testing

- Context: `runWithStudent` nests into the tenant store; `currentStudentId` fail-closed.
- `studentScoped`: prefixes PK + all GSIxPK; isolates two children within one tenant; fails closed.
- Composition: `studentScoped(tenantScoped(base))` yields `T#…#S#…#…` and isolates across both axes.
- students + family modules: handler + route-manifest + router tests.
- Existing 1054+ tests stay green (in-memory `makeData` defaults all three tiers to one unscoped
  client, so per-child repos work in tests without student context).
