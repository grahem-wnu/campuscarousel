# Module Spec — <Module Name>

> One self-contained brief per module. A worker should be able to build the whole module from
> this file + the foundational specs, touching only its own paths.

## Module id
`<kebab-id>` (matches `board.json`, `backend/modules/<id>/`, `frontend/src/modules/<id>/`)

## Purpose
<1-3 sentences from the master spec.>

## Depends on
<foundational specs always; plus any module whose data/endpoints this one reads. List ids.>

## Owns (entities)
<DynamoDB entities this module is primary for, with PK/SK + GSIs. Reference data-layer.md.>

## API endpoints (this module's slice of the master inventory)
<METHOD path — behavior, auth/role, validation, visibility notes. List every endpoint.>

## Frontend
<Views/screens, key interactions, empty state, role-specific differences, mobile behavior.>

## AI behavior (if any)
<Bedrock prompts/tools this module triggers, web-search on/off, async/SQS, output schema.>

## Privacy
<Which fields are visibility-bearing; confirm reads go through the visibility middleware.>

## File-ownership boundary
Create/edit ONLY: `backend/modules/<id>/**`, `frontend/src/modules/<id>/**`,
`backend/modules/<id>/routes.manifest.ts`, `frontend/src/modules/<id>/nav.manifest.ts`,
`specs/modules/<id>.md`. Consume foundational contracts; never edit them.

## Acceptance criteria
- [ ] Every endpoint above implemented + zod-validated + unit/integration tested.
- [ ] Visibility rule honored (test: parent blocked from private, keira allowed) where applicable.
- [ ] Frontend view + empty state, mobile + desktop, using design tokens + primitives.
- [ ] No hardcoded config; only owned paths touched; CI green; spec-reviewer approved.
