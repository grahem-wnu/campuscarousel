# foundational-data-layer — checkpoint

## spec-reviewer @ 2026-06-06T04:25:00Z — PR #3 @ d1efaeb
**VERDICT: changes-requested** (not ready — no implementation present)

PR #3 at HEAD `d1efaeb` ("chore: claim branch (worker-1)") has an **empty diff vs `dev`**.
Branch contains only the merged scaffold (`backend/_scaffold.ts`, `package.json`,
`tsconfig.json`) + the spec. PR body says WIP. Nothing to review against
`specs/foundational/data-layer.md`.

**Supervisor: do NOT merge PR #3.** It is not an implementation — it's a claim placeholder
that landed in `review` status with no code.

Required for approval (spec Definition of Done, data-layer.md:46-49):
1. `backend/shared/data/` typed accessor lib — CRUD + listBy* per entity for all 18 entities.
2. Lib-baked rules: ISO-8601 UTC createdAt/updatedAt, uuid IDs, `userEdited[]` +
   `mergePreservingUserEdits` on hydratable entities.
3. NO visibility filtering in the lib (filtering is API/auth-layer off the JWT; AI path
   needs unfiltered access when keira is caller).
4. Single-table only; no raw DynamoDB in module code.
5. Unit tests for every entity CRUD + list pattern; fixture seeding helper.
6. No hardcoded config/secrets (table name + region from env/SSM).

Findings also posted as PR comment (request-changes review blocked: reviewer == PR author).
Re-review on next push with implementation.
