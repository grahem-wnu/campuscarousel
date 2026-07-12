# Account Model: Student Logins + Unified Code Invites + Framing — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Let a parent invite the student (own `student`-role login, pinned to her roster entry, private journal reachable), unify all invites on shareable single-use codes, and add clear active-student framing. Spec: `docs/superpowers/specs/2026-07-12-account-model-student-logins-and-invites.md` (security-reviewed twice — read it).

**Architecture:** New `custom:studentId` Cognito attr (CDK + out-of-band migration like `custom:tenantId`); router pins `student` callers to their own studentId; a global-client `FamilyInvite` code record with a per-tenant listing GSI and a conditional single-use claim; authed create/list/revoke + a PUBLIC accept on the redeem Lambda; student confinement on family routes; a Family-page invite rework + public JoinFamilyPage + framing.

**Tech Stack:** TS; Zod; DynamoDB single-table; AWS CDK; Vitest + RTL (jsdom). Templates to copy: `backend/modules/invites/redeem.ts` + `backend/lambda/redeem.ts` (public code flow), `backend/shared/data/collections.ts` `makeInvites` (global code repo), `backend/shared/auth/cognito-provisioner.ts`, `frontend/src/shared/shell/JoinPage.tsx`/`SignupPage.tsx`.

**Conventions:** AWS `--profile wnu`, `us-east-2`, confirm account `010928187255` before deploy. Tests from repo ROOT (`cd /mnt/c/Keira/keiras-journey && npx vitest run <path> --exclude '**/agents/**'`); typecheck from workspace dir; `npm run check:routes` + `npm run check:isolation` from root. Every commit green. Branch `feat/account-model-student-logins` (off dev). No `npm install`; revert `.gitignore`/`.gstack` churn. **SECURITY: this touches privacy + tenant isolation — do not weaken the guards; the privacy/confinement tests are the highest-value deliverable.**

---

## Chunk A: Auth — `custom:studentId` claim + student pinning

### Task A1: Requester carries `studentId`
**Files:** `backend/shared/auth/types.ts`, `backend/shared/auth/requester.ts`, `requester.test.ts`
- [ ] **Step 1: Failing test** in `requester.test.ts`: a JWT with `custom:role='student'`, `custom:tenantId`, `custom:studentId='s1'` → `getRequester` returns `{username, role:'student', tenantId, studentId:'s1'}`; absent claim → `studentId` undefined.
- [ ] **Step 2:** Add `studentId?: string` to `Requester` (`types.ts`). In `requester.ts` (after the `tenantId` read ~line 56): `const studentId = asString(claims['custom:studentId']);` and include `...(studentId ? { studentId } : {})` in the returned object.
- [ ] **Step 3:** Run → pass; `cd backend && npx tsc --noEmit`. Commit: `feat(auth): requester reads custom:studentId`

### Task A2: Router pins a student to their own studentId (SECURITY)
**Files:** `backend/shared/api/router.ts`, `router.test.ts`
- [ ] **Step 1: Failing tests** (`router.test.ts`): (a) a `student` requester with `studentId='s1'` that sends header `x-student-id: s2` → the handler runs under student scope **s1** (assert via a stub handler capturing `currentStudentId()`); (b) a `student` with no `studentId` → 401; (c) a `parent` still honors the `x-student-id` header.
- [ ] **Step 2:** In `router.ts` replace the `studentId` resolution (~166-167):
```typescript
const studentId =
  requester.role === 'student'
    ? requester.studentId
    : (readHeader(event.headers, 'x-student-id') ?? process.env.DEFAULT_STUDENT_ID ?? undefined);
if (requester.role === 'student' && !requester.studentId) {
  throw Errors.unauthorized('Student is not bound to a roster');
}
```
- [ ] **Step 3:** Run → pass; full `backend/modules` + `backend/shared` tests green. Commit: `feat(auth): pin a student login to its own studentId (ignore X-Student-Id)`

---

## Chunk B: Data — links, FamilyInvite entity, conditional single-use claim

### Task B1: Data-model links
**Files:** `backend/shared/data/types.ts`
- [ ] Add `loginUserId?: string` to `Student` (the linked login's username). Add `studentId?: string` to `FamilyMember` and the value `'child'` to `MemberRelationship`. Add the `FamilyInvite` interface:
```typescript
export interface FamilyInvite extends Timestamped {
  code: string;
  tenantId: string;
  kind: 'coparent' | 'viewer' | 'student';
  relationship?: MemberRelationship;
  studentId?: string;      // required when kind==='student'
  displayName?: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: string;       // ISO; default now + 7 days
}
```
- [ ] `cd backend && npx tsc --noEmit` (expect downstream errors where `MemberRelationship`/`roleForAccess` switch exhaustively — fixed in B2/C). Commit with B2 (keep green): do NOT commit alone if it breaks a total switch.

### Task B2: `roleForAccess` total switch + relationship sync
**Files:** `backend/modules/family/handlers.ts`, `frontend/src/modules/family/{api.ts,FamilyPage.tsx}`
- [ ] Make `roleForAccess` a total switch over `MemberAccessLevel` (currently `manager|viewer` — do NOT add `student`). Add `'child'` to the FE `RELATIONSHIP_LABELS` map (`api.ts:96`) and the `RELATIONSHIPS` array (`FamilyPage.tsx:429`) so the unions stay in sync. `tsc` clean both. Commit B1+B2 together: `feat(account): data links (Student.loginUserId, FamilyMember.studentId, 'child'); FamilyInvite type`

### Task B3: Conditional single-use write on the table client
**Files:** `backend/shared/data/table-client.ts` (+ its dynamo impl), the in-memory test client, `table-client.test.ts`
- [ ] **Step 1: Failing test:** a `putIfStatusPending(item)` (or `putConditional`) succeeds when the stored item's `status==='pending'` (or item absent), and REJECTS (throws a typed `ConditionFailed`) when `status!=='pending'`. Cover both the dynamo-command shape (ConditionExpression) and the in-memory client.
- [ ] **Step 2:** Add a minimal conditional primitive to `TableClient`: `putIf(item: StoredItem, condition: { attr: string; equals?: unknown; notExists?: boolean }): Promise<void>` throwing `ConditionFailedError` on failure. Dynamo impl → `PutItemCommand` with `ConditionExpression` (`attribute_not_exists(#a) OR #a = :v`); in-memory impl → check the current item and throw if the condition fails. (Keep it tiny — only the FamilyInvite claim uses it.)
- [ ] **Step 3:** Run → pass; commit: `feat(data): conditional putIf primitive (for single-use invite claim)`

### Task B4: `FamilyInvite` repo — GLOBAL client, per-tenant listing GSI, atomic claim
**Files:** `backend/shared/data/collections.ts`, `backend/shared/data/index.ts`, tests
- [ ] **Step 1: Failing test:** `familyInvites.create` writes `PK=INVITE_FAMILY#<code>`, `GSI1PK='FAMILY_INVITES#'+tenantId`; `get(code)` reads by code (global); `listForTenant(tenantId)` returns only that tenant's; `claim(code)` (atomic) flips `pending→accepted` and a second `claim` REJECTS.
- [ ] **Step 2:** Implement `makeFamilyInvites(client)` mirroring `makeInvites` (`collections.ts:754-785`) but: PK `INVITE_FAMILY#<code>`, `GSI1PK='FAMILY_INVITES#'+domain.tenantId`; add `listForTenant(tenantId)` → `queryIndex('GSI1','FAMILY_INVITES#'+tenantId,…)`; add `claim(code)` → read, then `client.putIf({...current, status:'accepted', updatedAt}, { attr:'status', equals:'pending' })` (throws if not pending). Wire in `index.ts`: `familyInvites: makeFamilyInvites(base)` (GLOBAL base client — like `invites`, NOT `familyClient`).
- [ ] **Step 3:** Run → pass; `npm run check:isolation` (confirm the new global entity is intentional, like tenants/invites). Commit: `feat(data): FamilyInvite repo (global, per-tenant listing GSI, atomic claim)`

---

## Chunk C: Backend — invite endpoints + provisioner + remove email invite

### Task C1: Provisioner — student + generic from-invite path
**Files:** `backend/shared/auth/cognito-provisioner.ts`, `backend/modules/invites/redeem.ts` (the seam interface), tests
- [ ] Extend the provisioner seam with `provisionFromInvite({ loginName, password, tenantId, role, studentId? })`: `AdminCreateUser` (Username=`loginName`, SUPPRESS, `custom:role=<role>`, `custom:tenantId`, and when `studentId` present `custom:studentId=<studentId>`) + `AdminSetUserPassword` permanent. `UsernameExistsException → LoginNameTakenError`. Inline test seam (no AWS) records the created user. Keep `createParentUser`/`cognitoFamilyInviter` for now (removed with the old member endpoint in C3). Commit: `feat(auth): provisionFromInvite (student/coparent/viewer, custom:studentId)`

### Task C2: Family invite endpoints — create / list / revoke (authed)
**Files:** `backend/modules/family/{handlers.ts,schema.ts,routes.manifest.ts,*.test.ts}`
- [ ] **Step 1: Failing tests:** `POST /family/invites` (manager only) with `{kind:'student', studentId}` requires an existing, unlinked roster id → returns `{code, url}`; `kind:'coparent'|'viewer'` needs a `relationship`; a viewer/student caller → 403. `GET /family/invites` returns only this tenant's pending invites. `POST /family/invites/:code/revoke` (manager) flips to revoked; cross-tenant code → 404.
- [ ] **Step 2:** Add schema `createFamilyInviteSchema` (`kind`, `relationship?`, `studentId?`, `displayName?`, `count?` n/a). Handlers: `createInvite` (requireManager; `tenantId=currentTenantId()`; for student verify `students.get(studentId)` exists and `!loginUserId`; generate code; `expiresAt=now+7d`; create; return `{code, url: ${APP_URL}/join-family?code=<code>}`), `listInvites` (`familyInvites.listForTenant(currentTenantId())`, filter pending), `revokeInvite` (load by code, assert `tenantId===currentTenantId()`, `update status:'revoked'`). Register routes with `roles:['admin','parent']` in `routes.manifest.ts` + `buildRoutes` + `manifest.test`.
- [ ] **Step 3:** Green + `check:routes`. Commit: `feat(family): shareable-code invites (create/list/revoke)`

### Task C3: PUBLIC accept + remove the email member invite
**Files:** new `backend/modules/family/accept.ts` (pure, like `redeem.ts`), `backend/lambda/redeem.ts` (add the public route), `backend/modules/family/handlers.ts` (remove old `invite`), `infra` public route, tests
- [ ] **Step 1: Failing tests** (`accept.test.ts`, pure with an injected provisioner + in-memory data): accept a `student` code → provisions role `student` + `custom:studentId`, writes a `FamilyMember{relationship,studentId,userId:loginName}`, sets `Student.loginUserId`, marks invite accepted; body cannot override role/studentId/tenant; a second accept of the same code REJECTS (atomic claim); expired/revoked/unknown → error. `coparent`→role parent, `viewer`→role member (no studentId).
- [ ] **Step 2:** `acceptFamilyInvite(deps, { code, loginName, password, displayName? })`: `familyInvites.get(code)` → validate pending + not expired → `claim(code)` (atomic; on ConditionFailed → 409/validation) → derive `role` from `kind` (`coparent→parent, viewer→member, student→student`) → `runWithTenant(invite.tenantId, ...)`: for student re-check `students.get(invite.studentId).loginUserId` empty; `provisionFromInvite({loginName,password,tenantId:invite.tenantId,role,studentId:invite.studentId})`; `members.put({userId:loginName, relationship:invite.relationship ?? (kind==='student'?'child':'other'), accessLevel: kind==='viewer'?'viewer':'manager', studentId: kind==='student'?invite.studentId:undefined, status:'active', invitedBy: invite.invitedBy})`; if student `students.update(invite.studentId,{loginUserId:loginName})`. Wire the PUBLIC route on `backend/lambda/redeem.ts` (dispatch on `event.rawPath` like `/auth/signup`): `POST /family/invites/accept` body `{code, loginName, password, displayName?}`. **Remove** the old `POST /family/members` email invite handler + `cognitoFamilyInviter` email path + its email code; migrate/replace its tests (the member CRUD update/remove/list stay). Add the public route to the infra api-stack routes (unauthenticated, like `/redeem`).
- [ ] **Step 3:** Green (backend `tsc` + module tests + `check:routes`). Commit: `feat(family): public accept-invite (provision role from code) + drop email member-invite`

---

## Chunk D: Student confinement (family routes + list endpoints)

### Task D1: Audit + guard family-level mutations
**Files:** every `backend/modules/*/routes.manifest.ts`; known gap `backend/modules/reminders/routes.manifest.ts`
- [ ] **Step 1: Failing test:** a `student` requester → 403 on `PUT /reminders/settings` and `POST /reminders/send-test`.
- [ ] **Step 2:** Audit ALL manifests: for every mutating (POST/PUT/PATCH/DELETE) FAMILY-LEVEL route whose handler doesn't already self-guard (`requireGuardian`/`requireManager`), add `roles:['admin','parent']`. Confirmed gap: reminders mutations. (Per-child routes a student legitimately writes — journal/experience/motivation/essays/profile — stay open; the router pins their scope.) Document the audit result in the commit body.
- [ ] **Step 3:** Green. Commit: `fix(security): confine student logins to their own scope (guard family-level mutations)`

### Task D2: Restrict list endpoints for students
**Files:** `backend/modules/students/handlers.ts`, `backend/modules/family/handlers.ts`, tests
- [ ] **Step 1: Failing tests:** `GET /students` for a `student` returns ONLY their own roster row; `GET /family/members` for a `student` → 403 (manager+parent... actually any adult family role may list; student may not).
- [ ] **Step 2:** In `students` list handler: if `ctx.requester.role==='student'`, filter to `studentId === ctx.requester.studentId`. In `family` list handler: gate to non-student (or `requireRole('admin','parent','member')` — allow adult viewers, block student). Commit: `fix(security): a student can't enumerate siblings or family emails`

---

## Chunk E: Frontend — invite UI + JoinFamilyPage + framing

### Task E1: Family API + invite UI
**Files:** `frontend/src/modules/family/{api.ts,FamilyPage.tsx,*.test.tsx}`
- [ ] `api.ts`: add `createInvite({kind,relationship?,studentId?,displayName?})→{code,url}`, `listInvites()`, `revokeInvite(code)`; remove `inviteMember` (email). `FamilyPage.tsx`: (a) per-child roster row → **"Invite [name] to sign in"** → `createInvite({kind:'student',studentId})` → a small modal showing the shareable link/code with a Copy button; if `child.loginUserId` show "signed in as …". (b) Members section → "Invite" modal picks co-parent/viewer + relationship → `createInvite({kind, relationship})` → show code (no email field); list pending invites with Copy/Revoke. TDD the two flows. Commit: `feat(family): shareable-code invite UI (student + co-parent/viewer)`

### Task E2: Public JoinFamilyPage
**Files:** new `frontend/src/shared/shell/JoinFamilyPage.tsx` + AuthGate route `/join-family`, test
- [ ] Mirror `JoinPage.tsx`: read `?code=`, form `{loginName, password, displayName?}` → `POST /family/invites/accept` → on success auto sign-in (`startSignIn(loginName, password)`) and reload into the app (student → their dashboard; adult → family). Handle "login name taken" (retry) + invalid/expired code. Route it in `AuthGate` like `/join`. Commit: `feat(shell): public JoinFamilyPage (/join-family) to accept an invite`

### Task E3: Active-student framing + skip roster fetch for students
**Files:** `frontend/src/shared/shell/ActiveStudentContext.tsx`, a shared header/badge, tests
- [ ] For a `student` login (role from the auth context), **skip the `/students` fetch** and render a fixed no-switcher indicator of themselves. For parents/managers keep the switcher. Add a prominent "whose journey" indicator (e.g. "{name}'s journey") wherever child-scoped data renders (dashboard header at least). Ensure the signed-in user's own name/role shows (so parent ≠ student). Commit: `feat(shell): active-student framing + student login sees only itself`

---

## Chunk F: Infra + ship + staging E2E

### Task F1: CDK declare custom:studentId
**Files:** `infra/lib/auth-stack.ts`
- [ ] Add `studentId: new StringAttribute({ mutable: true })` to `customAttributes` (alongside role/tenantId/platformAdmin). `cd infra && npx tsc --noEmit`; `cdk diff` (expect a Schema add that no-ops on existing pools, like the tenantId back-port). Commit: `feat(infra): declare custom:studentId in the Cognito CDK`

### Task F2: Whole-repo green
- [ ] `cd backend && npx tsc --noEmit && npx vitest run` (root, agents excluded); `cd frontend && npx tsc --noEmit && cd /mnt/c/Keira/keiras-journey && npx vitest run frontend/src --exclude '**/agents/**'`; `cd infra && npx tsc --noEmit`; root `npm run lint && npm run check:routes && npm run check:isolation`.

### Task F3: Controller — migration + deploy + staging E2E (PRIVACY PROOF)
- [ ] **Migration (Grahem-authorized, like custom:tenantId):** `aws cognito-idp add-custom-attributes --user-pool-id <staging pool> ... Name=studentId,AttributeDataType=String,Mutable=true` on **staging** first. PR → dev → staging deploy (Auth stack no-ops the schema, validated). Then same on the **prod** pool before/with the prod promotion.
- [ ] **Staging E2E (the highest-value verification):** as parent (grahem) → invite the student → open the code link in a fresh/incognito session → set login name + password → sign in AS the student → confirm: she sees only her own data (no sibling switcher), can write a **private** journal entry, and the parent CANNOT see that private entry (log back in as grahem). Invite a co-parent (manager) + a viewer via code; confirm the viewer can't write and can't see private; confirm a student can't hit `/reminders` or list siblings. Only after staging passes: prod migration + `dev→main` promotion (Grahem's explicit go).

---

## Notes / risks
- **Security is the point.** The privacy/confinement/cross-tenant tests (A2, B4, C3, D1, D2) are the deliverable — do not skip. Two build caveats from review: (1) the D1 audit must enumerate EVERY manifest; (2) the single-use `claim` (B3/B4) must precede the Cognito create in accept so a lost race can't orphan a login.
- **Migration:** `custom:studentId` add is additive + irreversible; validate on staging (Auth deploy no-ops) before prod. Pre-migration there are no student logins, so nothing 401s.
- **Ordering:** ship FE+BE+infra together; nothing to prod until staging E2E (incl. the private-entry proof) passes and Grahem gives the prod go.
- Out of scope: parent "family home" landing; email invites; the super-admin `INVITE#` flow; migrating existing kate/keira seed users.
