# Foundational Spec — Shared API & Routing (FROZEN CONTRACT)

## Shape
API Gateway **HTTP API** → one routing Lambda (Node 20, TypeScript). Routes are assembled from
per-module **route manifests** so workers never edit a shared router file.

## Route manifest pattern (how 8 workers add routes without collisions)
Each module ships `backend/modules/<module>/routes.manifest.ts`:
```ts
import type { RouteDef } from "../../shared/api/types";
export const routes: RouteDef[] = [
  { method: "GET",  path: "/activities",      handler: listActivities },
  { method: "POST", path: "/activities",      handler: createActivity },
  // ...
];
```
The router globs `backend/modules/*/routes.manifest.ts` at build time and registers all of them.
No shared registry file to merge-conflict on. Duplicate path+method across modules = build error
(the reviewer/CI catches it).

## Conventions (every endpoint obeys)
- Auth: identity from the JWT (see `auth.md`); `getRequester(event)` available to handlers.
- Request/response: JSON. Success `2xx` with the resource/result; errors use a standard envelope:
  ```json
  { "error": { "code": "string", "message": "human readable" } }
  ```
  Codes: `unauthorized` (401), `forbidden` (403), `not_found` (404), `validation` (422),
  `conflict` (409), `internal` (500).
- Validation: every handler validates input (zod) before touching the data layer; invalid → 422.
- Visibility: reads of visibility-bearing data go through the visibility middleware. Always.
- Long ops (hydration, discovery) return immediately with a job id; work runs via SQS (see infra).
- No hardcoded config: table name, pool id, model id, etc. from env/SSM injected by CDK.

## Handler signature (contract)
```ts
type Handler = (ctx: {
  requester: { username: string; role: "admin"|"parent"|"student" };
  params: Record<string,string>;
  query: Record<string,string>;
  body: unknown;
}) => Promise<{ status: number; body: unknown }>;
```

## Endpoint inventory
The full endpoint list is in the master spec ("API Endpoints"). Each module spec lists exactly
the endpoints that module owns. The union must equal the master list.

## Definition of done
Router + manifest globbing + the handler harness + the error envelope + a zod validation helper
implemented and unit-tested with a sample module. Frozen.
