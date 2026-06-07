# foundational-ai-search — checkpoint

## supervisor @ 2026-06-06 — ASSIGNMENT (owner: infrastructure agent)

Spec: `specs/foundational/ai-search.md` (on dev). Enhancement (NOT critical path).

**Finding:** Bedrock/Claude has NO native web-search tool (`us.anthropic.claude-sonnet-4-6` rejects
`web_search_20250305`; only `custom`/`text_editor`/`bash`/`memory`/`tool_search_*` accepted). So
web search = a `custom` tool the Lambda executes via a third-party index. **Grahem chose Tavily**
(free tier).

**Secret (Grahem provides — do not commit/echo):** Tavily API key as an SSM **SecureString** at
`/keiras-journey/<env>/tavilyApiKey` (staging + prod). Build the helper without waiting on the key;
the live test is gated on it landing.

**Your work:**
1. `backend/shared/ai/search.ts` — Tavily client (`search(query,{maxResults})`); key lazy-read from
   SSM/env, cached; clear error if unset (callers degrade gracefully).
2. `backend/shared/ai/bedrock.ts` — shared Converse/InvokeModel tool-use loop registering a `custom`
   `web_search` tool; model id + `webSearch` flag from env. Single entry AI handlers call.
3. Confirm Lambda role can read + KMS-decrypt the SecureString (role has ssm:GetParameter on
   /keiras-journey/<env>/*; add kms:Decrypt only if a CMK is used). Lambdas have internet egress.
4. Tests (Tavily mocked): tool-use loop issues web_search + consumes tool_result; no-key degrades.
   Live (staging, --profile wnu, 010928187255) once key is in SSM: a research query returns a
   grounded answer with source URLs; no key in logs.
5. Boundaries: backend/shared/ai/** + infra SSM/KMS grant only. Branch feat/ai-search, draft PR → dev.

Module adoption (college-hub/peer-benchmark/ai-assistant) happens in those modules' own PRs later —
not this unit. Account guard: confirm get-caller-identity == 010928187255 before any AWS.

## supervisor @ 2026-06-06 — Tavily key stored
Key is in SSM SecureString at /keiras-journey/{staging,prod}/tavilyApiKey (account 010928187255). The unit is fully unblocked — build the helper and run the live web-search test against staging.

---

## infrastructure agent @ 2026-06-07 — DONE (PR #29, ready, live web-search proven on staging)

Branch `feat/ai-search` → **PR #29** (ready) into dev. Account confirmed 010928187255 before AWS.
Tavily key present as SecureString in both envs; KeyId = `alias/aws/ssm` (AWS-managed) → `ssm:GetParameter`
suffices, **no kms:Decrypt grant** needed.

**Built (boundaries: backend/shared/ai/** + infra SSM grant):**
- `shared/ai/search.ts` — Tavily client; key lazy from `TAVILY_API_KEY` else SSM `${SSM_PREFIX}/tavilyApiKey`
  (decrypted, cached); `SearchNotConfiguredError` on no-key (graceful). Key never logged.
- `shared/ai/bedrock.ts` — `converseWithSearch()`: InvokeModel tool-use loop registering a `custom`
  `web_search` tool; feeds tool_result back, final round drops tools to force prose; search failure →
  degrades. Returns {text, sources, rounds}; injectable client+searcher. `AI_WEB_SEARCH` gate, `BEDROCK_MODEL_ID`.
- `shared/ai/index.ts` public surface. `+ @aws-sdk/client-ssm` dep (runtime key read) + lockfile.
- infra: routing Lambda + `AI_WEB_SEARCH`; worker (async-stack) + `SSM_PREFIX`/`AI_WEB_SEARCH` env +
  `ssm:GetParameter` grant (`policies.ts ssmReadConfigStatement`).

**Gates:** 9 unit tests; typecheck ✅ lint ✅ check:routes ✅ 795 tests ✅; infra synth ✅; CI green on #29.

**LIVE (staging, wnu 010928187255):** temporary probe route in the real routing Lambda ran
`converseWithSearch(webSearch:true)` for the UMich BSN fall-2026 deadline → **HTTP 200**, model issued a
`web_search` tool call, **Tavily returned source URLs** (nursing.umich.edu, usnews.com, …), grounded answer
with citations (rounds: 3). **Role-based SSM decrypt of the SecureString worked.** No key in logs
(`tvly`/`api_key` → 0). Probe reverted; api-staging redeployed clean (route → 404).

**→ AI module owners (college-hub / peer-benchmark / ai-assistant):** adopt in your own PRs —
`import { converseWithSearch } from '../../shared/ai/index.js'` and call with `{ webSearch: true }`
(it's on by default via `AI_WEB_SEARCH` env in deployed lambdas). Both routing + worker lambdas can
read the key and reach the internet. No handler/contract changes needed on your side beyond the call.

I do not merge — PR #29 ready for spec-reviewer → supervisor.
