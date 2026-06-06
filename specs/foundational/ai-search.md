# Foundational — AI Web Search (Tavily as a Bedrock custom tool)

**Unit id:** `foundational-ai-search`  ·  **Wave:** 0 (foundational shared contract)  ·  **Owner:** infrastructure
**Not on the critical path** — it's an accuracy enhancement for AI features, not a merge blocker for
college-hub (whose blocker is async hydration). Wire it in as AI handlers need it.

## Why
CLAUDE.md mandates a web-search tool for "discovery, hydration, and benchmark research." Verified
2026-06-06: **Bedrock/Claude has NO native web-search tool** — `us.anthropic.claude-sonnet-4-6`
rejects `web_search_20250305` (only `custom`, `text_editor`, `bash`, `memory`, `tool_search_*` are
accepted). So web search must be a **custom tool** the Lambda executes via a third-party search API.
Grahem chose **Tavily** (2026-06-06) — an LLM-native search API.

## Secret (Grahem provides; do NOT commit or echo)
Tavily API key stored as an SSM **SecureString** at `/keiras-journey/<env>/tavilyApiKey` (staging +
prod). The Lambda role already has `ssm:GetParameter` on `/keiras-journey/<env>/*` — confirm it can
decrypt the SecureString (KMS: if a CMK is used, grant `kms:Decrypt`; the AWS-managed SSM key needs
no extra grant). Lambdas are not in a VPC, so outbound HTTPS to api.tavily.com works as-is.

## Deliverables
1. **`backend/shared/ai/search.ts`** — a thin Tavily client: `search(query, {maxResults}) →
   {title,url,snippet}[]`. Key read from env/SSM at runtime (lazy, cached). No key → throws a clear
   configuration error (callers degrade gracefully, like the suggesters' 503 path).
2. **`backend/shared/ai/bedrock.ts`** (or extend the existing AI call site into a shared helper) —
   a Converse/InvokeModel **tool-use loop** that registers a `custom` tool named `web_search`
   (input: `{query}`); when the model calls it, run `search()`, feed `tool_result` back, loop until
   the model returns text. Model id + a `webSearch: boolean` flag from env. This is the single
   shared entry the AI handlers call so behavior is consistent + tested once.
3. **Adopt it** where the spec calls for research (incremental, separate module PRs, not this unit):
   college-hub discovery/hydration, peer-benchmark, ai-assistant. Existing suggesters
   (certifications/goal-tracker) may keep model-knowledge-only or opt in later — not required here.
4. **IaC**: add the `tavilyApiKey` SSM SecureString as a *referenced* parameter (created out-of-band
   by Grahem; CDK reads/grants, does not store the secret). Confirm the role's SSM/KMS perms.

## Acceptance
- Unit tests: the tool-use loop issues a `web_search` tool call and incorporates `tool_result`
  (Tavily client mocked); no-key path degrades cleanly.
- Live (staging, `--profile wnu`, 010928187255): once the key is in SSM, a research call (e.g.
  "UMich BSN fall-2026 deadline") returns an answer grounded in fetched results (citations/urls in
  the response). No key echoed in logs.
- Boundaries: `backend/shared/ai/**`, infra SSM/KMS grant. Do NOT edit module handlers in this unit.
- Branch `feat/ai-search`, draft PR → dev. Supervisor merges.
