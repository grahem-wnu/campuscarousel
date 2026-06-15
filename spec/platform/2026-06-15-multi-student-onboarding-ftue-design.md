# Multi-student onboarding FTUE + guided tour — design

**Status:** proposed (Grahem, 2026-06-15). Builds on the multi-student-per-family work
(`2026-06-11-multi-student-per-family-design.md`) and the conversational onboarding (v2.1 F4).

## Problem

A newly invited family's first-time experience does not account for families with **more than one
child**, and it has a bootstrap hole even for one:

- A freshly-redeemed family has **zero students**. `OnboardingGate` bails when `activeStudentId` is
  null (`frontend/src/modules/onboarding/OnboardingGate.tsx:28`), so the conversational onboarding
  **never opens**. The family lands on an empty dashboard with no active student and no prompt.
- There is no "how many kids?" question anywhere. Setting up a second child is an undiscovered manual
  path: find **Family → Children → Add child** (`FamilyPage.tsx` → `POST /students`), then discover
  the **student switcher**, switch, and let `OnboardingGate` re-fire for that child.
- The switcher hides itself below two active children (`AppShell.tsx:350`), so a single-kid family
  never learns it exists — and nothing teaches it once a second child appears.

The data model already supports N children with full per-child isolation
(`T#<tenant>#S#<student>#`). The gap is **guidance**, not capability.

## Decisions (Grahem, 2026-06-15)

- **Continuous loop, then land.** Set up every child back-to-back in one sitting; reach the dashboard
  only after the last child.
- **The chat asks the count.** The conversational onboarding asks "how many students?" and the loop
  is driven from that — no separate pre-chat screen.
- **Approach A — the frontend orchestrates the loop; the chat stays single-student.** Smallest blast
  radius on the data layer; each unit keeps one responsibility.
- **Resume the loop.** If a parent abandons mid-loop, the declared count is persisted and the loop
  resumes (as a dismissible nudge) on next login.
- **Per-kid seeding runs in the background.** Each child's `finish` seeding fires async; the loop
  advances immediately. No spinner mid-loop.
- **A short guided tour on completion** (3–5 dismissible spotlight steps, **switcher first**), shown
  once. Spotlight on desktop, stepped-card fallback on mobile.

## The flow

```
Redeem invite → first login → roster empty
   └─ OnboardingFlow opens automatically (skip still allowed)
        Chat: "How many students are you setting up?" → captures count N → PUT /setup
        ── Kid i (1..N) ────────────────────────────────
        Chat interviews → Review form → "Finish & next"
           ⤷ POST /students {name, gradYear}   → new studentId, set active (stamps X-Student-Id)
           ⤷ POST /onboarding/finish           → seeds goals+colleges+budget ASYNC; advance now
        ── all N done ──────────────────────────────────
   └─ PUT /setup {setupComplete:true}; close flow → launch Guided Tour (switcher step first)
```

Kid 1 is a strong gate (the app is unusable with zero data; "skip" is still available, as today).
Kids 2..N resume as a **soft, dismissible** nudge — never a hard block; the Family page remains the
manual path.

## Frontend (Approach A — frontend orchestrates)

- **`OnboardingFlow`** (new, `modules/onboarding`) — the loop owner. Holds `{ index, total }`
  (`total` defaults to 1 until the chat reports `studentCount`). For the current child it renders
  `OnboardingChat`; on that child's finish it, in order:
  1. `POST /students { name, graduationYear }` (from the reviewed profile) → new `studentId`;
  2. `setActiveStudentId(studentId)` — synchronously stamps the `X-Student-Id` header
     (`ActiveStudentContext.tsx:74-78`) so the next call is correctly scoped;
  3. `finishOnboarding(profile)` — seeds for the now-active child (`onboarding-chat/handlers.ts:68`);
  4. `reload()` the roster (switcher updates); `index++`.
  When `index >= total`: `PUT /setup {setupComplete:true}`, close, dispatch a `start-tour` event.
- **`OnboardingChat`** (small refactor) — stays "dumb": instead of calling `finishOnboarding` itself
  (`OnboardingChat.tsx:49-59`), it calls an injected `onFinish(profile)` so the orchestrator owns the
  structural side effects (student creation, active switch, advance). It also reads the new
  `studentCount` off the turn and shows a per-child greeting ("Now let's set up your next child").
- **`OnboardingGate`** (updated) — opens `OnboardingFlow` when setup is incomplete, **including the
  zero-students bootstrap** (drop the `!activeStudentId` early-return for that path). On login,
  compares `students.filter(onboardingComplete).length` against `declaredStudentCount` from
  `GET /setup`; if short, shows the dismissible resume prompt that re-enters the loop at the next
  child. Keeps the existing per-session dismissal and "Prefer a form?" fallback.

The `studentCount` is persisted via `PUT /setup` the moment the chat reports it, so resume survives a
logout even before kid 1 finishes.

## Backend (deliberately minimal)

1. **onboarding-chat**: extend the chatter's structured extraction with an optional
   `studentCount: number`, add it to the turn type + `chatSchema`, and update the system prompt so its
   **first** question is "how many students are you setting up?". `chat` and `finish` are otherwise
   untouched — `finish` still seeds the **active** student, which is exactly the per-child behavior the
   loop wants.
2. **New `setup` module** — a **family-level singleton** (same shape as `reminderSettings`):
   `GET /setup` and `PUT /setup` over `{ declaredStudentCount?: number; setupComplete?: boolean }`,
   parent/admin only, tenant-scoped (no active student needed). This is the resume anchor.

No change to the per-child scoping, the router's `runWithStudent`, or the 22 untouched modules.

## Guided tour

- **`GuidedTour`** (new component) registered as a shell `tour` slot. Lightweight **spotlight**:
  dimmed backdrop + a cutout around the target element's bounding rect + a tooltip card with
  Back / Next / Skip. **No new dependency** (per the light-deps convention).
- **Anchors** via `data-tour` attributes: `switcher` (the `StudentSwitcher` button,
  `AppShell.tsx:344`), then `focus`, `journal`/why-nursing, `colleges`, `reminders` nav entries.
- The **switcher step renders only when ≥2 active students** exist — a one-child family skips it
  cleanly (and the switcher is visible by then because the second child exists).
- **Completion** stored in `localStorage` (`campus-carousel:tourComplete`) — frontend-only; a single
  re-show on a brand-new device is acceptable. Auto-runs once after the loop (on `start-tour`).
- **Mobile**: nav is a bottom bar / hamburger, so below the desktop breakpoint the tour degrades to a
  simple stepped-card sequence rather than spotlight cutouts.

## Edge cases

- **Family of one** → `studentCount=1`, loop runs once, switcher tour-step auto-skipped.
- **Declared 2, wants 1 now** → an "I'll add the rest later" exit closes the loop; the resume nudge
  appears next login (dismissible); the Family page is always available.
- **Chat never reports a count** (model hiccup) → `total` defaults to 1; resume path + Family page
  still let them add more. (`chat` already degrades gracefully, `handlers.ts:62-64`.)
- **Co-parent logs in mid-setup** → setup state is family-level, so either adult can resume.
- **Seeding latency** → async per child; the loop never blocks on it. The dashboard's existing
  setup/hydration banner reports progress.

## Testing

- **Backend**: chat turn carries `studentCount`; `finish` seeds scoped to the **active** child —
  prove kid 2's seed does not touch kid 1 (per-child `S#` isolation); `/setup` GET/PUT round-trips and
  is parent/admin-gated; route-manifest + router tests for the new module. Existing 1054+ tests stay
  green.
- **Frontend**: the loop creates exactly one student per child and advances; the active student is set
  **before** `finish`; resume re-enters at the correct index from `GET /setup`; the tour shows the
  switcher step only at ≥2 children and persists completion.
- **E2E**: family-of-two full run lands on the dashboard with two onboarded children and launches the
  tour; refreshing after kid 1 resumes at kid 2; family-of-one runs once with no switcher step.
