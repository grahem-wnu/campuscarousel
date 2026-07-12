# Account Model — student logins + unified shareable-code invites + active-student framing

**Tier**: 3 (multi-tenant auth change + new invite system + data links + UI + a prod Cognito migration)
**Date**: 2026-07-12
**Status**: Design approved conversationally (Grahem, 2026-07-12); pending written-spec sign-off

## Why
A parent signs up but (1) there's no way to invite their **student (kid)** with her own login, and (2) the app *feels* like it treats the parent as the student. Root causes (from the code map):
- **Student = roster row only.** A `Student` is a data container (`STUDENT#<id>`, per-child keys `T#<t>#S#<s>#`); it has no login and no link to any user. The `student` role (the ONLY role that can read `private` journal/experience/motivation entries — `visibility.ts:19-21`) is defined but **never assigned to anyone** — so the private-journal + "coach as the student" features are currently unreachable.
- **Invites can't mint a student.** `POST /family/members` → `roleForAccess` only emits `parent` (manager) or `member` (viewer); no `student`, no `Student`↔login link, and it's **email + temp-password**, not shareable.
- **Framing:** the signer IS a `parent` (correct), but every screen renders the **active child's** data (`X-Student-Id` scope) and the parent has no personal surface — so a one-kid family feels like "the app thinks I'm the student."

## Decisions (Grahem, 2026-07-12)
- **Student gets her own login** (`student` role), **bound to her roster entry**; pinned server-side to her own `studentId` (can't switch to a sibling; her private entries are truly private from parents).
- **Unify ALL invites on a shareable link/code** (student, co-parent/manager, family viewer) — replaces the email/temp-password member invite. Works for kids with no email.
- **Clear active-student framing**: a prominent "whose journey" indicator (e.g. "Keira's journey"); the parent is never presented as the student.
- Accepted this includes a **prod Cognito migration** (a new `custom:studentId` attribute, same shape as the recent `custom:tenantId` add).

## The model (target)
- **Tenant = family.** Owner signs up as `parent`.
- **Student** = the kid's roster row + per-child data (unchanged), now optionally **linked to a login** (`Student.loginUserId?`).
- **Logins** (Cognito users, tracked as `FamilyMember`): `parent`/`admin` (managers), `member` (viewers), and now **`student`** (bound to one `studentId`). A student login's `FamilyMember` carries `relationship: 'child'` + `studentId`.
- **Invite** = a shareable single-use **code** the parent generates and hands over; the invitee opens the link, sets their own password, and joins with the right role/binding.

## Cognito changes (auth)
- **New custom attribute `custom:studentId`** (String, mutable) on the user pool. Declare in CDK `auth-stack.ts` `customAttributes` (alongside `role`/`tenantId`/`platformAdmin`); and — because CloudFormation can't add attributes to an existing pool — **add it out-of-band via `add-custom-attributes` on staging + prod** (Grahem-authorized migration step, exactly like the `custom:tenantId` add). Only student logins get it set.
- **`requester.ts`**: read `custom:studentId` into `Requester.studentId?` (mirror `tenantId`).
- **Provisioner**: add a `createStudentUser({ username, password, tenantId, studentId })` path (or generalize the inviter) that stamps `custom:role='student'` + `custom:tenantId` + `custom:studentId`, permanent password (they chose it on accept). Username: a code-derived handle (no email required) — e.g. the parent-chosen login name, or `<familyslug>-<childname>`; must be unique in the pool. (The pool is username-based, so no email needed.)

## Router — student pinning (SECURITY-CRITICAL)
`backend/shared/api/router.ts:166-167` currently trusts the `X-Student-Id` header for everyone. Change so a **`student`-role caller is pinned to their own `studentId`**, ignoring the header:
```typescript
const studentId =
  requester.role === 'student'
    ? requester.studentId                        // pinned: student sees ONLY their own roster
    : (readHeader(event.headers, 'x-student-id') ?? process.env.DEFAULT_STUDENT_ID ?? undefined);
if (requester.role === 'student' && !requester.studentId) throw Errors.unauthorized('Student not bound to a roster');
```
So a student can never read/write a sibling's data, and their `private` entries (only `canSeePrivate` when `role==='student'`) are theirs alone. Parents/managers keep the free switcher. Family-management routes stay `requireRole('admin','parent')` (students 403 there); the roster/`/family` nav stays hidden from students.

## Unified invite system (backend)
Replace the email member-invite with a code-based flow. New/changed:
- **`FamilyInvite` entity — stored on the GLOBAL `base` client (NOT tenant-scoped), keyed `INVITE_FAMILY#<code>`** (mirrors how the super-admin `INVITE#` lives on `base` so a public, JWT-less endpoint can look it up by code alone — a tenant-scoped key `T#<t>#…` is NOT computable without a tenant context and MUST NOT be used). `tenantId` is carried as a **field**. Fields: `code, tenantId, kind: 'coparent'|'viewer'|'student', relationship?, studentId? (for student), displayName?, invitedBy, status: 'pending'|'accepted'|'revoked', expiresAt, createdAt, updatedAt`. Code is random, URL-safe, non-enumerable. **Listing index MUST be partitioned per tenant: `GSI1PK = 'FAMILY_INVITES#' + tenantId`** — a plain `'FAMILY_INVITES'` collection would return EVERY family's live codes to ANY manager (cross-tenant account-takeover). TTL default **7 days** (short — it's a bearer credential granting private-journal/manager access; rely on single-use + revoke, not a long window).
- **`POST /family/invites`** (admin/parent, `requireManager`): validate; for `kind:'student'` require a `studentId` that exists in the roster and isn't already linked; create the invite (its `tenantId` = `currentTenantId()`, never from the body); return `{ code, url }`, `url = ${APP_URL}/join-family?code=<code>`. No Cognito user yet, no email.
- **`GET /family/invites`** (manager): query `GSI1PK='FAMILY_INVITES#'+currentTenantId()` → only this family's pending invites. **`POST /family/invites/:code/revoke`** (manager; verify the loaded invite's `tenantId === currentTenantId()` before revoking).
- **`POST /family/invites/:code/accept`** (PUBLIC — no authorizer, on the redeem Lambda): body is `{ loginName, password, displayName? }` **ONLY** — role, `studentId`, tenant come from the STORED invite, never the request. Flow: read invite by code from `base`; **atomically claim it single-use** (conditional write: only proceed if `status==='pending'` and not expired — a Dynamo conditional-update / optimistic check so two concurrent accepts can't both provision); re-validate (for `student`) that `invite.studentId` isn't already linked; then `runWithTenant(invite.tenantId, …)` to provision + link:
  - `coparent` → `custom:role='parent'`; `viewer` → `custom:role='member'`; `student` → `custom:role='student'` + `custom:studentId=<invite.studentId>`.
  - Write a `FamilyMember { userId: loginName, relationship, studentId? (student only), status:'active' }`. For `student`, also set `Student.loginUserId = loginName`. **Role is derived from the invite `kind`, NOT from `accessLevel`** (see data-links note). Mark invite `accepted`. The SPA then signs them in.
  IAM: the redeem Lambda already has `AdminCreateUser`/`AdminSetUserPassword` (`api-stack.ts:162-165`); setting `custom:studentId` needs none extra.
- **Data links**: add `Student.loginUserId?: string`; extend `FamilyMember` with `studentId?: string` and relationship value `'child'`. **Do NOT add `'student'` to `MemberAccessLevel`** — that would make `roleForAccess` (`family/handlers.ts:42`) map student→`member`. The student's Cognito role comes from the invite `kind` in the accept handler; leave `accessLevel` unset/`'viewer'` for the student's member row. Also make `roleForAccess` a **total switch** over `MemberAccessLevel` so any future value forces an explicit mapping. Keep sync: backend `MemberRelationship` enum (`types.ts:79-87`), `RELATIONSHIPS` (`FamilyPage.tsx:429`), and the FE `RELATIONSHIP_LABELS` map (`family/api.ts:96`) all gain `'child'`.
- **Remove** the existing email `POST /family/members` invite (folded into `/family/invites`); migrate its tests. Update any caller.
- Provisioner seam: extend the inviter with a `provisionFromInvite(kind, { loginName, password, tenantId, studentId? })` path; the inline test seam creates users without AWS.

## Student confinement — routes (SECURITY, don't skip)
Pinning scopes a student's *per-child* data, but **the router only auto-blocks `member` writes (`router.ts:148`), NOT `student`** — so a student can still hit any family-level mutating route that doesn't self-guard. Concretely, `reminders` has NO role guard (`PUT /reminders/settings`, `POST /reminders/send-test` — `reminders/handlers.ts:44,70`): a student could rewrite the family's reminder recipients. Fix:
- **Add `roles: ['admin','parent']`** (router per-route guard, `router.ts:139`) to every mutating family-level route whose handler doesn't already self-guard — audit all `routes.manifest.ts`; the reminders mutations are the known gap. (`students`, `setup`, `family` already self-guard with `requireGuardian`/`requireManager`.)
- **Restrict the family-level LIST endpoints for a `student` caller** (they're tenant-scoped, not student-scoped, so a pinned student otherwise sees siblings + adult emails): `GET /students` returns only the student's own roster row (or 403) for `role==='student'`; `GET /family/members` becomes manager-gated (or filtered) — supersedes O2 now that a student login exists.
- Preferred hardening: a single router rule confining `role==='student'` to per-child + own-profile routes rather than trusting 24 handlers to each guard.

## Frontend
- **`FamilyPage.tsx`**:
  - **Per-child roster rows**: add an **"Invite [name] to sign in"** action → calls `POST /family/invites {kind:'student', studentId}` → shows the shareable link/code in a small modal (copy button). If the child is already linked (`loginUserId`), show "signed in as …" instead.
  - **Members section**: the "Invite" modal now picks **who** (co-parent / family viewer) → `POST /family/invites {kind, relationship}` → shows the shareable code (no email field). List pending invites with copy/revoke. Remove the email/temp-password path.
- **New public `JoinFamilyPage` (`/join-family?code=`)**: enter a login name + password (+ display name) → `POST /family/invites/:code/accept` → auto sign-in → land (student → their dashboard; adult → family). Mirror the existing `JoinPage`/`SignupPage` shell.
- **Active-student framing**: a prominent indicator of the active child (e.g. header/badge "Keira's journey" driven by `useActiveStudent`), shown wherever child-scoped data renders (dashboard, essay center, journal, profile). For a **student** login: **skip the `/students` roster fetch entirely** in `ActiveStudentProvider` (`ActiveStudentContext.tsx` — a student otherwise receives the sibling list on first paint) and render a **fixed, no-switcher** indicator of themselves. For parents/managers it stays the switcher. Ensure the parent's own name/role is visible (so "you" ≠ "the student").

## Migration / rollout
- `custom:studentId`: CDK-declare + out-of-band `add-custom-attributes` on staging then prod (Grahem-authorized), same as `custom:tenantId`. Validate on staging (Auth deploy no-ops on the existing pool).
- Existing data: prod is essentially empty; grahem's tenant has no students yet. No backfill needed. Existing seed users (kate/keira) are separate (see prod-release follow-ups).
- Ship FE+BE+infra together; verify on staging end-to-end before prod promotion.

## Testing
- **Backend/privacy + student confinement (highest value):** a `student`-role requester is pinned to their `studentId` and **cannot** read another student's data even if it sends a different `X-Student-Id`; a student **can** read their own `private` entries; a `parent`/`viewer` **cannot** read any `private` entries; a `viewer` (`member`) is blocked from all writes. **Confinement:** a `student` is 403'd on family-management mutations incl. `PUT /reminders/settings` + `POST /reminders/send-test`; `GET /students` returns only their own row for a student; `GET /family/members` is manager-gated. **Cross-tenant:** `GET /family/invites` returns ONLY the caller's tenant's invites (never another family's codes); revoke/accept verify the invite's `tenantId`. **Atomicity:** two concurrent `accept`s of one code provision exactly one login (conditional single-use). Accept body cannot set role/studentId/tenant (comes from the stored invite). Invite lifecycle: create (manager only; student kind needs a real, unlinked roster id) → accept provisions the right role/binding + links the Student → revoke. Accept rejects expired/used/unknown codes.
- **Frontend:** per-child "invite to sign in" shows a shareable code; members invite picks kind and shows a code (no email); JoinFamilyPage accept → sign-in; active-student framing renders the child's name and, for a student login, has no switcher.
- **Staging E2E:** as a parent (grahem), invite the student → open the code link in a private session → set password → sign in AS the student → confirm she sees only her own data, can write a private journal entry, and grahem (parent) cannot see that private entry. Invite a co-parent and a viewer via code; confirm roles.

## Out of scope (this pass)
- Parent-oriented "family home" landing (framing chosen was "clear active-student indicator," not a new home).
- Email delivery of invites (shareable code only).
- Reworking the super-admin `INVITE#` new-family flow (separate system; unchanged).
- Migrating the existing kate/keira seed users (tracked separately).

## Resolved decisions
- **O1 — student login username → the child picks it at accept** (Grahem, 2026-07-12). The JoinFamilyPage accept form takes `loginName` (+ password + optional display name); validate it's unique in the pool (surface a friendly "that name's taken" and let her retry). No email required.
- **O2 — member-list visibility → SUPERSEDED by the student-confinement fix.** Now that a `student` can log in, `GET /family/members` (which exposes all adults' emails) and `GET /students` (siblings) must NOT be open to a student. Manager-gate `GET /family/members`; for a `student` caller `GET /students` returns only their own row. (For adult roles the list stays visible; only students are restricted.)
