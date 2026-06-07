# interview-prep — checkpoint

## spec-reviewer @ 2026-06-06T21:55Z — PR #25 (head 7800860) — 🔴 CHANGES REQUESTED (privacy hard-fail)

Reviewed `feat/interview-prep` (+1591/-0, 21 files) vs `specs/modules/interview-prep.md`. High-quality
module — Bedrock/authz/boundary/grounding all clean — but it has a real PRIVACY-MODEL violation in the
persisted-feedback read path. Blocking.

### 🔴 HARD FAIL — Privacy: private-derived AI feedback leaks to family via family-readable sessions
- The AI grounding is correct: `grounding.ts:38-40` runs activities/clinical/why-nursing through
  `aiVisibleSet(items, requester)` off the JWT (keira's private entries included for keira, excluded
  for parent/admin). Verified + tested (grounding.test.ts, handlers.test.ts).
- BUT the `answer` handler persists the AI feedback derived from that private grounding onto the
  session: `handlers.ts:161-163` writes `aiFeedback: renderFeedback(feedback)` (and the typed `answer`)
  into the question. The master spec confirms feedback QUOTES private content (spec L1027: "the soup
  kitchen conversation with Marcus from your Why Nursing journal").
- AND sessions are unowned + family-readable: the frozen `Interview` type (shared/data/types.ts) has
  NO owner/visibility field; `interviews.list()` (handlers.ts:92) returns ALL sessions and
  `get`/`requireSession` (handlers.ts:82-86,100) is existence-only — no JWT/owner filter.
- ⇒ A parent (kate) calling `GET /interviews` or `GET /interviews/:id` receives keira's mock session
  including `aiFeedback`/`answer` that quote her PRIVATE entries. This violates **interview-prep.md:47
  ("private entries only surfaced for keira")** and the CLAUDE.md privacy rule (private hidden from
  grahem/kate). The session *metadata* may be family-visible (L40), but private-derived feedback/answers
  must be keira-only.

**Fix (close the leak):** gate the private-derived fields (per-question `aiFeedback` + `answer` on
mock-practice sessions) to the session's owner / keira.
- Cleanest = add an owner (`createdBy`) + visibility dimension to the `Interview` type so `list`/`get`
  can be scoped off the JWT. The `Interview` type is **frozen/shared → out of the module's lane**, so
  this needs a foundational change — **ESCALATED to supervisor/infra** (same pattern as the Bedrock/SQS
  deps). Stamp `createdBy = ctx.requester.username` on create, scope `list` to the caller, and 404
  others on `get`.
- Interim in-lane option (no type change): when serving a mock-practice session to a caller who isn't
  its creator, strip `aiFeedback` + `answer` from the returned questions. (Needs to know the creator —
  so it still ultimately wants the owner field; a pure role gate is imperfect since a parent's own
  mock has non-private feedback they should see.)
Add a privacy test for the READ path: a parent reading keira's session does NOT receive private-derived
`aiFeedback`/`answer` (today's tests only cover the grounding stage).

### Other findings (non-blocking)
2. [Completeness] Web search not implemented for school-specific questions (`ai.ts` plain InvokeModel,
   no tools; spec L34) — STANDING Grahem/web-search decision (spans ai-assistant/college-hub/
   scholarship-tracker/peer-benchmark too).
3. [Conformance-minor] Custom questions stored in `profiles.preferences.interviewQuestions`
   (handlers.ts:188-200) vs an owned bank entity (spec L16-17 lists question-bank under Owns) — confirm
   intended storage.
4. [minor] `ai.ts` `extractJson` naive first/last-brace slice — low risk (curated fallback catches
   parse failures).

### Clean (verified)
Bedrock server-side, model from `process.env.BEDROCK_MODEL_ID` (throws if unset, no hardcode), graceful
curated fallback; authz off the JWT (401 proven); three-dot boundary strictly within interview-prep
trees; no cross-module imports (shared accessors only); single-table; append-only manifests; nav
`group: 'secondary'`. Grounding-stage privacy test present + strong.

**Verdict: CHANGES REQUESTED** — finding 1 (privacy leak) gates merge; it likely needs the foundational
owner/visibility field on the frozen `Interview` type (escalated to supervisor) + in-module JWT scoping.
⚠️ Self-PR under `grahem-wnu` (no formal `--request-changes`) → this checkpoint + the PR comment are the
signal.

---

## worker-2 @ 2026-06-06T23:55Z — read-path privacy leak FIXED — PR #25 @ b4a9935

Spec-reviewer HARD FAIL (head 7800860) was correct: grounding was filtered, but the AI feedback/answer
(which can quote keira's PRIVATE entries) was persisted onto a family-readable session → a parent
reading GET /interviews(/:id) saw it. Closed in-lane (no frozen-type edit):

1. **Owner stamp** — `createdBy` stored on create + mock as an extra attribute (round-trips;
   stripInternal only drops PK/SK/GSI). Real owner today; the escalated foundational owner/visibility
   field just formalizes it.
2. **Scrub on read** — `scrubForReader` strips per-question `aiFeedback` + `answer` from mock-practice
   sessions for non-creator callers (metadata + question text stay family-visible per spec L40;
   real-interview logs untouched; `rating` kept). Applied in list + detail.
3. **Answer gate** — only the creator may answer a mock (403 otherwise) — no cross-user grounding/
   overwrite; private feedback only flows to its owner.

+ READ-path privacy test (your ask): parent gets the session but NOT keira's aiFeedback/answer (detail
  + list); keira does; 403 on a parent answering keira's mock. 27 tests; typecheck+lint+check:routes ✓.
PR comment posted. Believe finding 1 is closed → re-review. Non-blocking (2)(3)(4) acknowledged.

---

## spec-reviewer @ 2026-06-06T22:12Z — PR #25 round 2 (head b4a9935) — 🔴 CHANGES REQUESTED (narrowed; one residual leak path)

Re-reviewed delta `7800860..b4a9935` (three-dot boundary clean). CI now green.

**Good progress — the list/get leak is FIXED + tested:**
- Sessions now stamp `createdBy = ctx.requester.username` on create (handlers.ts:131,168), stored as an
  extra attribute (frozen type has no owner; round-trips since the data layer only strips PK/SK/GSI —
  clever in-lane workaround, documented, with the proper foundational field still escalated).
- `scrubForReader` (handlers.ts:88-93) blanks each question's `answer`/`aiFeedback` for non-owners;
  applied on `list` (116) and `get` (123). `answer` is owner-gated (only the creator). Read-path
  privacy test added (handlers.test.ts:79-93): keira sees answer+feedback; a parent gets metadata only
  (answer/aiFeedback undefined). Confirms the round-trip too. 

### 🔴 Still blocking — residual leak + authz gap on the UPDATE/DELETE paths
1. **[Privacy] `PUT /interviews/:id` (handlers.ts:136-142) returns the full updated session
   UNSCRUBBED**, bypassing `scrubForReader` (`requireSession` is existence-only). A parent can read
   keira's session id from `list` (which returns ids), then `PUT` any patch to it and receive her
   private-derived `aiFeedback`/`answer` in the 200 response — the same leak you just closed on
   list/get, via a different path. Fix: `return { status: 200, body: scrubForReader(await
   interviews.update(id, patch), ctx.requester.username) }`.
2. **[Authz/integrity] `update` (PUT) and `remove` (DELETE, handlers.ts:145-150) only check existence,
   not ownership** → a non-owner can mutate or delete another user's session. You already gate `answer`
   to the creator; do the same for update/delete of `mock-practice` sessions (or at least block a
   non-owner from mutating a session that carries private-derived feedback). Add a test: a parent
   PUT/DELETE on keira's mock session is rejected (or scrubbed for PUT).

Everything else from round 1 stands as clean (grounding aiVisibleSet, Bedrock env/server-side/fallback,
boundary, nav). Non-blocking items 2-4 (web-search/Grahem, question-bank storage, extractJson) unchanged.

**Verdict: CHANGES REQUESTED** — close the PUT response scrub + owner-gate update/delete (the last
private-derived read path). Narrow + in-lane. ⚠️ Self-PR under `grahem-wnu` → checkpoint + PR comment
are the signal.

---

## worker-2 @ 2026-06-07T00:55Z — consumes foundational Interview.createdBy — PR #25 @ a143d63

The supervisor landed `Interview.createdBy` on the frozen type (2ace75f) — the owner field I needed
for the read-path privacy fix. Rebased #25, dropped the interim `OwnedInterview` cast, and now read
`session.createdBy` directly in `scrubForReader` + the answer-owner gate. Behavior unchanged; 23 tests
green; typecheck+lint clean. The privacy fix is now fully aligned with the foundational field.

---

## spec-reviewer @ 2026-06-06T23:05Z — PR #25 round 3 (head a143d63) — 🔴 CHANGES REQUESTED (residual STILL open — escalating)

Re-reviewed delta `b4a9935..a143d63`. Boundary clean; CI green.

**Good:** the foundational `Interview.createdBy` field LANDED on the frozen type (the escalation was
actioned — thank you), so the round-2 extra-attribute workaround is gone; scrubForReader + the
`answer` owner-gate now use the real `session.createdBy`. list/get scrub stands.

### 🔴 STILL OPEN (raised round 2, NOT fixed this round) — the PUT/update/delete leak + authz gap
1. **`PUT /interviews/:id` (update handler) still returns the session UNSCRUBBED** — no `scrubForReader`
   on the response, no owner check. A parent can `PUT` to keira's mock session id and get her
   private-derived `aiFeedback`/`answer` back in the 200 body — the exact leak closed on list/get, via
   PUT. Now TRIVIAL since `createdBy` is a real field:
   `return { status: 200, body: scrubForReader(await getData().interviews.update(id, patch), ctx.requester.username) }`.
2. **`update` + `remove` are not owner-gated** (`requireSession` is existence-only) → a non-owner can
   mutate/delete keira's mock session. Gate both like you already gate `answer`:
   `if (session.createdBy !== ctx.requester.username) throw Errors.forbidden(...)` (load the session first).
Add a test: a parent PUT/DELETE on keira's mock session is rejected, and a parent PUT response is scrubbed.

This finding has now survived round 2 → round 3 unaddressed. **ESCALATING to the supervisor** (the worker
fixed adjacent privacy items twice but keeps missing the update/delete/PUT paths; the fix is ~5 lines now
that createdBy exists). Per the convergence rule, supervisor please nudge/assist so it lands next round.

**Verdict: CHANGES REQUESTED** — close item 1 (PUT scrub) + item 2 (owner-gate update/delete). ⚠️ Self-PR
under `grahem-wnu` → checkpoint + PR comment are the signal.

---

## worker-2 @ 2026-06-07T16:35Z — round-3 residual leak CLOSED — PR #25 @ b3350da

Reviewer was right to escalate — I missed the PUT path across rounds 2-3. Now closed:
- `update` (PUT) + `remove` (DELETE) are **owner-only**: load session, 403 unless
  `session.createdBy === requester.username`. Closes the PUT-response leak (a parent can't PUT to
  keira's session) and stops cross-user mutate/delete of a session with private-derived feedback.
- `update` also returns `scrubForReader(updated, requester)` defensively.
- Test added: parent PUT/DELETE on keira's mock → 403; owner can edit + sees her own fields.
Every private-derived path (list/get/put/delete/answer) is now owner-scoped. 24 tests; typecheck+lint
clean. Re-review please — believe this is the last privacy item.

---

## spec-reviewer @ 2026-06-07T20:15Z — PR #25 round 4 (head b3350da) — ✅ APPROVED

The residual is fixed. Re-reviewed delta `a143d63..b3350da` (boundary clean; CI green).

- **`update` (PUT)** now owner-gates (`session.createdBy !== ctx.requester.username → forbidden`) AND
  scrubs the response (`scrubForReader(updated, ctx.requester.username)`) — the PUT leak is closed.
- **`remove` (DELETE)** now owner-gated. No more cross-user mutation/delete.
- Test added (handlers.test.ts): a parent gets **403** on both PUT and DELETE; the owner can edit.

**Privacy model now complete and correct across every path:** AI grounding via `aiVisibleSet`
(keira-includes / parent-excludes, tested); private-derived per-question `aiFeedback`/`answer` scrubbed
for non-owners on list/get AND the PUT response; `answer`/`update`/`remove` all owner-gated via the
landed `Interview.createdBy`. This closes the round-1 privacy hard-fail (private-derived feedback leaking
to a parent via family-readable sessions) end-to-end.

Non-blocking (standing/Grahem, unchanged): web-search tool not wired; question-bank stored in
profiles.preferences; extractJson naive (curated fallback covers it).

**Verdict: APPROVED — clean + green; privacy fully enforced.** ⚠️ Self-PR under `grahem-wnu` →
checkpoint + PR comment are the merge signal. Supervisor to merge. I do not merge.
