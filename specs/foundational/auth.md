# Foundational Spec — Auth & Privacy (FROZEN CONTRACT)

## Cognito
- User pool: **username sign-in, no email** (`username_attributes` NONE, `auto_verified_attributes`
  empty, email not required). No self-signup. Suppress welcome emails.
- App client (no secret, for SPA). 3 pre-created users: `grahem` (custom:role=admin), `kate`
  (parent), `keira` (student). Temp passwords → `NEW_PASSWORD_REQUIRED` on first login.
- Admin password reset only (Grahem via CLI / an admin-only endpoint). No forgot-password.
- Frontend: `@aws-amplify/auth` v6, tokens in memory, ID token in `Authorization` header.

## API authorizer
- API Gateway HTTP API + **Cognito JWT authorizer** validates every request. No custom auth code.
- The Lambda reads identity from the validated JWT claims: `username` and `custom:role`.

## Privacy enforcement (the rule every module obeys)
Entries with a `visibility` field (`family` | `private`) on journal, clinical, and why-nursing
entities:
- `private` entries are visible ONLY to `keira`. Hidden from `grahem` and `kate`.
- The **AI path** receives ALL entries (incl. private) **when keira is the authenticated caller**.
- Enforcement lives in a shared middleware `backend/shared/auth/visibility.ts`:
  ```ts
  filterForRequester(items, requester): Item[]   // drops private items unless requester is keira
  assertCanRead(item, requester): void           // throws 403 if a parent fetches a private item by id
  aiVisibleSet(items, requester): Item[]          // returns all when requester is keira, else family-only
  ```
- Modules MUST route every read of visibility-bearing data through this middleware. Never trust a
  client-supplied filter. The spec-reviewer hard-fails any module that bypasses it.

## Shared auth helpers (contract)
`backend/shared/auth/`:
```ts
getRequester(event): { username, role }       // from JWT claims
requireRole(roles[]): middleware              // e.g. admin-only endpoints
```

## Definition of done
AuthStack deployed; a real login returns a JWT the authorizer accepts; the visibility middleware
implemented + unit-tested (parent blocked from a private entry, keira allowed, AI set includes
private for keira only). Frozen.
