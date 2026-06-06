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
