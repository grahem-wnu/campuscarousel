# Background the onboarding seed — design

**Status:** approved (Grahem, 2026-06-15). Fixes a 30–60s spinner on the final onboarding step.

## Problem

`POST /onboarding/finish` saved the profile and then, **synchronously on the request path**, ran the
seeding: an AI goal-suggester call + an AI college-namer call + created ~12 colleges + dispatched
their hydrate/asset jobs. That's ~30–60s — past the API's 30s budget — so the "Finish & open the
dashboard" button spun for a long time before the family reached the dashboard/tour.

## Fix

Background the seeding (the rest of the app already offloads heavy AI to the async worker):

- `finish` now saves the profile (marks `onboardingComplete`) and **enqueues** an `onboarding-seed`
  job, returning **202** immediately. The family lands on the dashboard/tour at once; goals + colleges
  fill in shortly after (the dashboard already shows hydration progress).
- The seeding logic moves to `backend/modules/onboarding-chat/seed.ts` (`seedStudent`), run by the SQS
  worker via a new `hydration.manifest.ts` (`type: 'onboarding-seed'`). The worker sets the message's
  tenant/student context, so the seed is correctly scoped.
- Reuses the **shared hydration queue** (the API Lambda already has `HYDRATION_QUEUE_URL` + send
  grant) — no new queue. The dispatcher falls back to an inline run when no queue is configured
  (tests/local).
- One infra add: the hydration worker now gets `ASSETS_QUEUE_URL` + send grant, because the
  backgrounded seed dispatches per-college imagery (the API Lambda had this; the worker didn't).

## Testing

- `seed.test.ts`: `seedStudent` seeds goals/colleges (+hydrate/assets dispatch) + budget, is
  idempotent on existing colleges, and is best-effort (returns 0/0, never throws, on AI failure); the
  enqueuer prefers the queue and falls back inline; the worker handler runs only on `onboarding-seed`.
- `handlers.test.ts`: `finish` returns 202, saves the profile (with GPA coercion + budget mapping),
  and **enqueues** seeding (does not run it inline).
- `cdk synth`: hydration worker has `ASSETS_QUEUE_URL`; the `onboarding-seed` handler is in the worker
  registry.

## Out of scope

- A dashboard "still seeding…" indicator for goals (colleges already show hydration progress). Goals
  appear on the next dashboard load after the worker runs; a live poll could be added later.
