# Frontend — Keira's Journey

React + Vite + TypeScript + Tailwind SPA. This workspace holds the **design system**,
the **app shell**, and the **API client** (the `foundational-design-system` unit), plus
each feature module under `src/modules/<m>/`.

## Layout

```
src/
  main.tsx, App.tsx, index.css   app root + global styles
  shared/
    design/tokens.ts             design tokens (single source of truth; Tailwind reads these)
    ui/                          primitives: Button, Card, Modal, Table, Tabs, Badge,
                                 EmptyState, Field/Input/Textarea/Select, DateField,
                                 Toast, Spinner, Chip, Icon  (barrel: ui/index.ts)
    api/                         typed fetch client (barrel: api/index.ts → `api`)
    shell/                       nav globbing, router, auth gate, login, AppShell, slots
  modules/<m>/                   feature modules (owned by their worker)
    nav.manifest.ts              append-only nav/route registration (globbed by the shell)
```

## Local development

```sh
cp .env.example .env.local   # fill in the values below
npm install                  # from the repo root (workspaces)
npm run dev  -w @keiras-journey/frontend
npm run build -w @keiras-journey/frontend
```

### Runtime configuration (`VITE_*`, build-time)

No config is hardcoded. Vite reads these at build; CI/CD injects them from SSM
(`/keiras-journey/<env>/...`). They are public by design (the Cognito app client has no
secret); never commit real values — `.env.local` is git-ignored.

| var | meaning |
| --- | --- |
| `VITE_AWS_REGION` | AWS region (`us-east-2`) |
| `VITE_USER_POOL_ID` | Cognito User Pool id |
| `VITE_USER_POOL_CLIENT_ID` | Cognito app client id (SPA, no secret) |
| `VITE_API_BASE_URL` | HTTP API base URL, no trailing slash |

## How modules consume the design system

- **Nav + routes:** ship `src/modules/<m>/nav.manifest.ts` exporting `nav: NavEntry[]`.
  The shell globs these — no shared nav file to merge-conflict on.
- **UI:** import primitives from `../../shared/ui` (`Button`, `Card`, `EmptyState`, …).
  Compose them; never fork or restyle them. Use token classes (`bg-primary-600`,
  `text-ink-700`) — never raw hex.
- **Data:** import `{ api }` from `../../shared/api` and call `api.get/post/put/del`.
  Never use raw `fetch`. Errors throw a typed `ApiError` with the envelope `code`.
- **Auth:** `useAuth()` from `../../shared/shell` gives `{ user, role }`. Privacy is
  enforced server-side off the JWT — the client never filters private data for security.
- **Shell slots (optional):** the AI Assistant fills the slide-over and Quick-Add fills
  the FAB modal by calling `registerSlot("ai-panel" | "quick-add", () => import("./X"))`
  from their `nav.manifest.ts`.

## Tests

Vitest runs from the repo root (`npm test`). The runner discovers `*.test.ts` — logic
tests (tokens, nav assembly, the API client, `cn`) live next to their source. React
component DOM tests would need a `.tsx` + jsdom setup, which the runner doesn't glob yet;
keep shared-layer tests to pure logic.
