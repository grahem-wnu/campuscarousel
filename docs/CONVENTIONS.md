# Conventions — Keira's Journey monorepo

This is the working contract for everyone building in this repo (human or agent). It is
produced by the `foundational-scaffold` unit and describes the **root** scaffolding only.
The behavioural source of truth is still `spec/keirasjourney-spec.md` and the per-unit specs
under `specs/`. Where a foundational contract spec (data-layer, auth, api, design-system,
infra, cicd) says something specific, that spec wins for its area.

## Monorepo layout

```
/                      root: workspaces, base TS/ESLint config, route guard, test runner (THIS unit)
/backend               npm workspace — Lambda (Node 20, TS). modules/<m>/ + shared/ frozen libs
/frontend              npm workspace — React + Vite + TS. src/modules/<m>/ + src/shared/
/infra                 CDK (TS) — all AWS. Owned by foundational-infra (NOT a workspace yet; see below)
/scripts               repo tooling (the check:routes guard lives here)
/specs                 one spec per unit/module
/docs                  CLAUDE.md context, this file, env/setup docs
```

## Workspaces & tooling

- npm workspaces. Root `package.json` declares `"workspaces": ["backend", "frontend"]`.
  Feature modules live **inside** those workspaces (`backend/modules/<m>`,
  `frontend/src/modules/<m>`), so adding a module never edits root `package.json`.
- Root scripts, all run from the repo root:
  - `npm run typecheck` → `tsc --noEmit` in each workspace (`--if-present`).
  - `npm run lint` → `eslint .` (flat config, `eslint.config.mjs`).
  - `npm test` → `vitest run` (discovers `**/*.{test,spec}.ts`).
  - `npm run check:routes` → duplicate-route guard (see below).
- TypeScript end to end. `tsconfig.base.json` holds the strict baseline
  (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, …). Each workspace
  `tsconfig.json` extends it and sets only environment specifics (backend = NodeNext/node
  types; frontend = Bundler/DOM/`react-jsx`). New leaf tsconfigs must `extends` the base.
- ESLint v9 flat config at the root covers the whole tree. Modules do **not** add their own
  ESLint config.

### Placeholders

`backend/_scaffold.ts` and `frontend/_scaffold.ts` exist only so `tsc` has an input before
real source lands. Delete them once a workspace has actual `.ts`/`.tsx` files — they are
inert (`export {}`).

## File-ownership boundaries (hard rule — how parallel workers avoid collisions)

A **feature module** `<m>` edits only:
- `backend/modules/<m>/**`
- `frontend/src/modules/<m>/**`
- `specs/modules/<m>.md`
- and registers routes/nav via **append-only manifests** it owns:
  `backend/modules/<m>/routes.manifest.ts` and `frontend/src/modules/<m>/nav.manifest.ts`.

A **foundational unit** edits only its own area (e.g. `backend/shared/data/**` for data-layer).
Never edit a shared/foundational file you don't own, or another unit's files. If you need a
change in someone else's area, say so in your PR and stop — the supervisor coordinates it.

### Route & nav manifests (no shared registry to merge-conflict on)

Routes are assembled by globbing `backend/modules/*/routes.manifest.ts`; nav by globbing
`frontend/src/modules/*/nav.manifest.ts`. You append a new manifest file; you never edit a
central list. Shapes (`RouteDef`, `NavEntry`) come from the frozen api/design-system contracts.

## The `check:routes` guard

`scripts/check-routes.mjs` parses every `backend/modules/*/routes.manifest.ts` with the
TypeScript AST and fails the build if two manifests declare the same `method` + `path`
(method compared case-insensitively). The same path with different methods is fine. A route
whose `method`/`path` is computed (not a string literal) can't be checked statically and is
reported as skipped (non-fatal) — prefer literals so the guard can protect you. Run it with
`npm run check:routes`; CI runs it on every PR.

## API & error conventions (from `specs/foundational/api.md`)

- Identity comes from the validated Cognito JWT — `getRequester(event)` / handler `ctx.requester`.
  No custom auth code.
- JSON in/out. Errors use the envelope `{ "error": { "code", "message" } }` with codes
  `unauthorized|forbidden|not_found|validation|conflict|internal`.
- Validate every input (zod) before touching the data layer; invalid → 422.
- Long operations return a job id immediately and run via SQS.

## Privacy (do not get this wrong — `specs/foundational/auth.md`)

Journal, clinical-hours, and why-nursing entries carry `visibility: family | private`.
`private` entries are visible only to `keira` — hidden from `grahem` and `kate` — but the
**AI path receives all entries (including private) when keira is the authenticated caller**.
Enforcement is server-side off the JWT via `backend/shared/auth/visibility.ts`. Never trust a
client-supplied filter. Every module that reads visibility-bearing data routes it through that
middleware, and every such module ships a privacy test: a parent **cannot** read a private
entry, keira **can**.

## No hardcoded config / no secrets

Table name, pool/client ids, API URL, model id, queue url, bucket/distribution ids, etc. come
from env vars (CDK injects them from SSM `/keiras-journey/<env>/...`). Never hardcode account
ids, table names, or model ids; never commit secrets. The wnu account `010928187255` /
`us-east-2` is the only target — never `791321067225`.

## Tests

- Vitest, run from root. Colocate tests with source as `*.test.ts` next to what they cover.
- Each module: unit tests for logic + one integration test per endpoint, **including** the
  privacy test above.
- Default Vitest environment is `node`. A frontend test needing a DOM opts in per file with
  `// @vitest-environment jsdom` (the design-system workspace adds the `jsdom` dependency when
  the shell lands).

## Adding runtime dependencies

Add a workspace's runtime deps to **that workspace's** `package.json`
(`backend/package.json` / `frontend/package.json`), not the root. Root holds only shared dev
tooling (TypeScript, ESLint, Vitest). Because several foundational backend units (data-layer,
auth, api) share `backend/package.json`, coordinate dependency additions through the supervisor
to avoid concurrent edits to the same file.

## Open coordination items (flagged to the supervisor by this unit)

1. **`infra` is not yet a root workspace.** `infra/` (CDK app + `package.json` + a `synth`
   script) is owned by `foundational-infra`. The CI workflow (`.github/workflows/ci.yml`,
   owned by `foundational-cicd`) runs `npm run -w infra synth`, which requires the `infra`
   workspace to exist. When `foundational-infra` lands, add `"infra"` to the root
   `workspaces` array (a root-file edit — this unit's owner / the supervisor makes it). Until
   then the CI `synth` step depends on infra and is outside this unit's control.
