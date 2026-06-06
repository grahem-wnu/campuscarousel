# Shared API & routing (`backend/shared/api`)

The frozen API contract (`specs/foundational/api.md`). One routing Lambda self-routes
the HTTP API's `$default` route from per-module **route manifests** — no shared router
file to merge-conflict on.

## Writing a module

1. **Handlers** — `(ctx) => Promise<{ status, body }>`. `ctx` is:
   ```ts
   { requester: { username, role }, params, query, body }
   ```
   Identity (`requester`) comes from the validated JWT — never trust client input.

2. **Validate** every input before touching the data layer (invalid → 422 automatically):
   ```ts
   import { validateBody, z } from "../../shared/api";
   const Body = z.object({ title: z.string().min(1), date: z.string() });
   export const createActivity: Handler = async (ctx) => {
     const input = validateBody(Body, ctx);
     // ...use input, call the data layer...
     return { status: 201, body: created };
   };
   ```

3. **Errors** — throw `Errors.notFound() / conflict() / forbidden() / validation()` (or any
   `ApiError`); the router turns them into the standard envelope
   `{ "error": { "code", "message" } }`. The data layer's `NotFoundError` maps to 404 too.
   Unexpected throws become a generic 500 (the real error is logged, never leaked).

4. **Register** routes in `backend/modules/<m>/routes.manifest.ts` (append-only; the
   `check:routes` guard fails the build on a duplicate method+path):
   ```ts
   import type { RouteDef } from "../../shared/api";
   import { listActivities, createActivity } from "./handlers";
   export const routes: RouteDef[] = [
     { method: "GET",  path: "/activities",     handler: listActivities },
     { method: "POST", path: "/activities",     handler: createActivity },
     { method: "GET",  path: "/activities/:id", handler: getActivity },
     // role-gated endpoints: add `roles: ["admin"]`
   ];
   ```
   Paths support `:param` and `{param}` segments; static segments beat params.

## The Lambda entry (wired by infra/cicd)

```ts
import { createLambdaHandler, loadRoutes } from "./shared/api";
const routes = await loadRoutes(MODULES_DIR); // globs backend/modules/*/routes.manifest.*
export const handler = createLambdaHandler(routes);
```

`loadRoutes` discovers and imports each module manifest at cold start (or feed
`createLambdaHandler` a statically-imported route list if the bundler prefers). Responses
are always JSON; `204` carries no body.
