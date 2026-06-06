# Foundational Spec — Design System & App Shell (FROZEN CONTRACT)

Built in the foundational phase. Workers consume tokens + primitives + the nav manifest; they
don't restyle the shell or edit shared components.

## Aesthetic (from the master spec)
Warm, approachable, aspirational — not clinical/corporate. This is Keira's app, not a
surveillance tool. Soft blues/greens or earth tones. Clean sans-serif, mobile-first, high
readability. Every module has a helpful empty state.

## Tokens (`frontend/src/shared/design/tokens.ts` + Tailwind config)
- Color: a warm primary, a calm secondary, semantic success/warn/error, neutral scale. Defined
  once as Tailwind theme tokens; modules use token classes, never raw hex.
- Type scale, spacing scale, radius, shadow — all tokenized. No magic numbers in module CSS.
- Dark-mode-ready token structure (light ships first).

## App shell (`frontend/src/shared/shell/`)
- Top nav: logo "Keira's Journey" + primary tabs (Dashboard, Journal, Colleges, Scholarships,
  Timeline). Secondary nav (dropdown/sidebar) for the rest. Mobile: bottom tab bar (5 primary) +
  hamburger overflow.
- Floating AI chat button (bottom-right) → slide-over panel (the AI Assistant module fills it).
- Quick-add FAB available app-wide.
- Auth gate: unauthenticated → login page; authenticated → shell. Role drives which dashboard
  widgets show.

## Nav manifest pattern (how workers add nav without collisions)
Each module ships `frontend/src/modules/<module>/nav.manifest.ts`:
```ts
import type { NavEntry } from "../../shared/shell/types";
export const nav: NavEntry[] = [{
  id: "journal", label: "Journal", group: "primary", order: 20,
  route: "/journal", icon: "book", element: () => import("./JournalPage"),
}];
```
The shell globs `frontend/src/modules/*/nav.manifest.ts` and assembles nav + routes. No shared
nav file to merge-conflict on.

## Shared primitives (`frontend/src/shared/ui/`)
Button, Card, Modal, Table, Tabs, Badge, EmptyState, Field/Form inputs, Toast, Spinner,
DateField, Chips/Tags. Workers compose these; they don't fork them. Data-density per the master
spec (dashboard dense, journal spacious, comparison tabular).

## API client (`frontend/src/shared/api/client.ts`)
Typed fetch wrapper: attaches the Amplify ID token, parses the error envelope, exposes
per-resource methods generated from the endpoint inventory. Workers call this, not raw fetch.

## Definition of done
Tokens, Tailwind config, shell with auth gate + nav globbing, the primitive set, and the API
client implemented and visually checked on mobile + desktop. Frozen.
