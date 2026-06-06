# ai-assistant — checkpoint

## spec-reviewer @ 2026-06-06T21:29Z — PR #24 (head ac23b6f) — ✅ APPROVED

Reviewed `feat/ai-assistant` (+1268/-0, 17 files) against `specs/modules/ai-assistant.md`. This is
the most privacy-sensitive module in the app, and the privacy model is implemented correctly. CI
green; 40 tests.

- **PRIVACY ✓ (verified myself — the critical surface):** the AI grounding context is assembled off
  the JWT `ctx.requester` using the frozen **`aiVisibleSet`** helper for exactly the three
  private-bearing sources — `handlers.ts:60-62` (`clinical`/`activities`/`whyNursing` =
  `aiVisibleSet(raw, requester)`); the filtered lists feed `buildSummary`/`selectRecords`, raw lists
  never reach the prompt. `aiVisibleSet` (shared `visibility.ts:51-54`): student → ALL items (keira's
  context INCLUDES private — the whole point of essay/interview help); parent/admin → private
  filtered out. **Correct helper** (not `filterForRequester`, which would wrongly hide keira's own
  private entries from her AI). Conversation history is per-`userId`, read/continued only by its owner
  (404 — not 403 — for others). **Privacy test proves both directions** (`handlers.test.ts:92-131`):
  keira's essay-partner context includes the private why-nursing entry + private hours (20h); a
  parent's excludes them (8h). Family-visible sources (courses/teas/colleges/goals/scholarships)
  correctly passed through unfiltered.
- **AI/Bedrock ✓** — server-side only; model from `process.env.BEDROCK_MODEL_ID` (throws if unset, no
  hardcode); graceful fallback (503 unconfigured / 502 on failure); reply fetched BEFORE any DB write
  (no dangling records on failure). Prompt-injection: user/journal content placed as labeled data
  (clipped), separate from the system prompt; role from `requester.role`, never client-trusted.
- **Authz ✓** — every route off the JWT (401 proven); conversation ownership enforced.
- **Conformance ✓** — frozen shared contracts (uses shared `auth` visibility + `ConversationRepo`);
  three-dot boundary strictly within ai-assistant trees; NO cross-module code imports (reads other
  modules' data via shared single-table accessors; uses the sanctioned `ai-panel` shell slot);
  single-table; append-only manifests.
- **Tests ✓** — privacy (both directions), authz 401, cross-user 404 isolation, model-failure 502 /
  unavailable 503 / no-dangling-write. 40 tests.

Findings (non-blocking): (1) [Completeness] web-search tool + citations NOT implemented
(`bedrock.ts`/`chat.ts` — `InvokeModel` sends no `tools`; `citations` hardcoded `[]`); spec lists it
for ask/discovery modes — **standing Grahem decision** (same gap across college-hub/scholarship-tracker/
peer-benchmark; the privacy-critical contextual core works without it). (2) [minor] `chat.ts:115`
`toolsUsedFor` `>= 0` guard always true. (3) [minor] `AiPanel.tsx:37` frontend passes only `module`,
not `essayId`/`collegeId` (backend supports them) — essay-partner auto-context is route-segment-based.

**Verdict: APPROVED — clean + green; privacy model correct and tested.** ⚠️ Formal `--approve`
impossible (self-PR under `grahem-wnu`) → checkpoint + PR comment are the merge signal. Supervisor to
merge. I do not merge.
