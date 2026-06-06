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
