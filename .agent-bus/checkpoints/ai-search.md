# foundational-ai-search — checkpoint

## spec-reviewer @ 2026-06-07T20:55Z — PR #29 (head 0ddf30b) — ✅ APPROVED

Reviewed `feat/ai-search` (+573/-2, 10 files) vs `specs/foundational/ai-search.md`. Foundational unit
landing the SHARED web-search capability (Tavily-backed custom `web_search` tool + Bedrock tool-use
loop) — resolves the standing web-search escalation (Grahem chose Tavily; Bedrock/Claude has no native
web_search tool). Not consumed by modules here; adoption is per-module follow-up. CI green; live-verified
on staging.

- **Security ✓ (verified myself — the critical surface):** Tavily API key resolved lazily from
  `TAVILY_API_KEY` env (tests/local) else the **SSM SecureString** `${SSM_PREFIX}/tavilyApiKey`
  (`GetParameter` `WithDecryption:true`); no key → `SearchNotConfiguredError` (callers degrade, never
  crash). **Key is never logged** (zero console/logger calls in search.ts/bedrock.ts; sent only in the
  Tavily request body) and never hardcoded. New SSM IAM grant is **least-privilege** — scoped to
  `arn:aws:ssm:<region>:<account>:parameter${ssmPrefix}/*`, NOT `*`; SecureString uses the AWS-managed
  `alias/aws/ssm` key so no `kms:Decrypt` grant needed. Bedrock IAM remains scoped (inference profile +
  sonnet models). model id from `BEDROCK_MODEL_ID`.
- **Correctness ✓** — `converseWithSearch`: gated by `AI_WEB_SEARCH` env; tool-use loop registers a
  custom `web_search` tool, feeds `tool_result` back, and **offers tools every round except the last**
  (guaranteed prose termination, round cap default 4); search failure (no key / network) → "search
  unavailable" tool result so the model still answers from its own knowledge. Returns `{text, sources,
  rounds}`. Fully injectable (Bedrock client + searcher) for tests.
- **Conformance ✓** — foundational scope: only `backend/shared/ai/**` + `infra/` (SSM env+grant on
  routing + worker Lambdas) + `backend/package.json` (`@aws-sdk/client-ssm`) + lockfile. Purely additive
  — existing modules' own Bedrock usage is untouched (they adopt this later in their own PRs).
- **Tests ✓** — 9 unit tests (tool-use issues web_search + consumes tool_result; webSearch off;
  final-round cutoff; search-failure degradation; result mapping; no-key error); 795 total green; infra
  synth ✓. Staging probe: real Tavily search w/ citations, role-based SSM decrypt worked, no key in logs,
  probe reverted.

**Verdict: APPROVED — clean + green; secret handling + least-privilege IAM verified.** Once merged, the
AI modules (college-hub, peer-benchmark, scholarship-tracker, ai-assistant, interview-prep) can adopt
`converseWithSearch` in follow-up PRs to close the web-search accuracy gap. ⚠️ Self-PR under `grahem-wnu`
→ checkpoint + PR comment are the merge signal. Supervisor to merge. I do not merge.
