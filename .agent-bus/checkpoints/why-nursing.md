# why-nursing — checkpoint

## spec-reviewer @ 2026-06-06T17:18Z — PR #11 (head 71c33af) — 🔴 CHANGES REQUESTED

Reviewed `feat/why-nursing` (+1282/-0, 15 files) against `specs/modules/why-nursing.md`.
Strong, conformant implementation — but one explicit acceptance criterion is not fully met.

**What's right (no hard fails):**
- Boundary clean — all files within `backend/modules/why-nursing/**` + `frontend/src/modules/why-nursing/**`
  (verified). No shared-contract edits, no secrets/hardcoded config (`dataFromEnv()`).
- **Privacy ✓ (acceptance L44 met)** — enforced server-side off `ctx.requester` (JWT) on every path:
  list `handlers.ts:43` (before the in-memory category filter, so category can't re-expose private),
  detail `:53`, create-private gate `:60-61`, update `:75-76`, delete `:89`; uses the frozen
  `backend/shared/auth` helpers. Privacy test proves parent blocked / keira allowed on the SAME
  private id, and `aiVisibleSet` respects the requester (`handlers.test.ts`, `router.test.ts`).
- Conformance, correctness, single-table access, tests otherwise clean; CI green.

### Required changes (worker-actionable, in your lane)

1. **[Completeness — acceptance criterion unmet] `frontend/src/modules/why-nursing/EntryForm.tsx`
   — no UI to set/clear `linkedActivityId` / `linkedClinicalId`.** Spec L43 requires "linking to
   journal/clinical entries **implemented + tested**" and L24 lists "optional link to a journal/
   clinical entry" as a form field. Backend accepts the fields, `EntryCard.tsx:58-72` renders them,
   and edits preserve them — but a user can never **create or change** a link from the UI, so the
   linking criterion is only half-implemented. Fix: add link affordance(s) to `EntryForm` bound to
   `linkedActivityId`/`linkedClinicalId` + a frontend test. activity-journal is merged, so a journal
   entry picker is buildable now; clinical-hours links can follow when PR #13 lands (or accept an
   optional id field for both in the interim). This is the one item gating approval.

### Non-blocking nit (fix if you like, won't gate)
2. [UX-minor] `EntryForm.tsx:50` `category: category || undefined` — once set, a category can't be
   cleared back to uncategorized (the `undefined` is dropped and the repo merge preserves the old
   value), while `tags` *does* overwrite with `[]`. Inconsistent. Either document it or allow
   clearing.

**Verdict: CHANGES REQUESTED** on item 1. ⚠️ GitHub formal `--request-changes` is impossible
(self-PR under `grahem-wnu`); posted as a PR review **comment** — treat this checkpoint + the comment
as the signal. Worker: address item 1, push, and update this checkpoint to re-request review.
