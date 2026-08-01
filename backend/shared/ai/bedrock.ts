// Shared Bedrock entry for AI handlers. Wraps the Anthropic Messages API (InvokeModel) in a
// tool-use loop that registers a `custom` tool named `web_search` — because Bedrock/Claude has no
// native web-search tool. When the model calls it, we run the injected searcher (Tavily by default),
// feed the results back as a `tool_result`, and loop until the model returns prose. This is the one
// shared call site so web-grounding behaviour is consistent and tested once.
//
// Everything is injectable (Bedrock client + searcher + modelId + flags) so tests run with no
// network. Model id comes from `BEDROCK_MODEL_ID`; web search is gated by the `AI_WEB_SEARCH` env
// flag (or an explicit `webSearch` option). If search isn't configured (no key), the loop still
// returns the model's best answer from its own knowledge — it degrades, never throws on that path.

import { randomUUID } from 'node:crypto';
import { parseUsage, recordUsage, type RecordDeps } from '../metering/index.js';
import { tavilySearch, type SearchResult, type WebSearcher } from './search.js';

/** The Bedrock seam: serialize-in, serialize-out. Injectable so tests run without loading the AWS
 *  SDK at all (the SDK is large; only the default invoker imports it, once). */
export interface BedrockInvoker {
  invoke(modelId: string, body: Uint8Array): Promise<Uint8Array>;
}

/** Marks the end of a cacheable prompt prefix — everything up to and including this block is cached. */
interface CacheControl {
  type: 'ephemeral';
}

interface TextBlock {
  type: 'text';
  text: string;
  cache_control?: CacheControl;
}
interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input?: Record<string, unknown>;
}
type ContentBlock = TextBlock | ToolUseBlock;

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
  cache_control?: CacheControl;
}
interface Message {
  role: 'user' | 'assistant';
  content: string | Array<ContentBlock | ToolResultBlock>;
}
interface AnthropicResponse {
  stop_reason?: string;
  content?: ContentBlock[];
  usage?: Record<string, number>;
}

/** The custom web-search tool advertised to the model. */
const WEB_SEARCH_TOOL = {
  name: 'web_search',
  description:
    'Search the web for current, factual information (application deadlines, tuition, rankings, ' +
    'requirements, news). Returns titles, URLs, and snippets. Use it to ground claims, then cite ' +
    'the URLs you relied on.',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'The search query' } },
    required: ['query'],
  },
} as const;

export interface ConverseOptions {
  /** Feature label the recorded token usage is attributed to (e.g. 'benchmark', 'focus'). Required
   *  so every web-grounded call is metered against a named surface. */
  feature: string;
  /** Groups all rounds of one converseWithSearch call under a single request id. Defaults to a
   *  fresh uuid. */
  requestId?: string;
  /** Injectable metering client/rates (tests). */
  recordDeps?: RecordDeps;
  /** Optional system prompt. */
  system?: string;
  maxTokens?: number;
  /** Sampling temperature passed through to the model (omit for the model default). */
  temperature?: number;
  /** Tool-use round cap (final round runs without tools to force a text answer). Default 4. */
  maxRounds?: number;
  /** Enable the web_search tool. Defaults to env `AI_WEB_SEARCH === 'true'`. */
  webSearch?: boolean;
  /** Results per search. Default 5. */
  maxResults?: number;
  /** Override the model id (else `BEDROCK_MODEL_ID`). */
  modelId?: string;
  /** Inject the Bedrock client (tests) — else the real SDK client. */
  invoker?: BedrockInvoker;
  /** Inject the searcher (tests) — else Tavily. */
  searcher?: WebSearcher;
  /** Prompt caching across tool rounds. Default on; set false to opt a feature out. */
  cache?: boolean;
}

export interface ConverseResult {
  /** The model's final text answer. */
  text: string;
  /** De-duplicated search results consulted across the loop (for citations / UI). */
  sources: SearchResult[];
  /** How many model round-trips it took. */
  rounds: number;
}

/** The real Bedrock invoker — imports the SDK once and wraps InvokeModel. */
async function defaultInvoker(): Promise<BedrockInvoker> {
  const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const client = new BedrockRuntimeClient({});
  return {
    async invoke(modelId, body) {
      const res = await client.send(
        new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body,
        }),
      );
      if (!res.body) throw new Error('empty Bedrock response');
      return res.body;
    },
  };
}

interface MeterCtx {
  feature: string;
  requestId: string;
  recordDeps?: RecordDeps;
}

async function callModel(
  invoker: BedrockInvoker,
  modelId: string,
  body: Record<string, unknown>,
  meter: MeterCtx,
): Promise<AnthropicResponse> {
  const resBody = await invoker.invoke(modelId, new TextEncoder().encode(JSON.stringify(body)));
  const response = JSON.parse(new TextDecoder().decode(resBody)) as AnthropicResponse;
  // Record token usage for this round — recordUsage never throws, so metering can't break the call.
  await recordUsage(
    {
      feature: meter.feature,
      model: modelId,
      usage: parseUsage(response),
      requestId: meter.requestId,
      callId: randomUUID(),
      occurredAt: new Date().toISOString(),
    },
    meter.recordDeps,
  );
  return response;
}

/**
 * Remove every cache breakpoint from the conversation.
 *
 * Anthropic caps a request at 4 `cache_control` blocks and this loop can run 7 rounds, so marks are
 * never allowed to accumulate — there is at most ONE live breakpoint at a time.
 */
function stripCacheBreakpoints(messages: Message[]): void {
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const block of m.content) {
      delete (block as { cache_control?: CacheControl }).cache_control;
    }
  }
}

/**
 * Move the single cache breakpoint to the end of the conversation so far.
 *
 * Every round of this loop re-sends the whole transcript, and hydration runs up to 7 rounds — so by
 * the last round the model is re-reading (and re-paying full input price for) everything the earlier
 * rounds gathered. Marking the tail makes the next round read that prefix at 0.1x instead of 1.0x.
 *
 * Moving the mark is safe: a relocated breakpoint still hits the prefix cached by the previous round.
 * Verified against Bedrock on 2026-08-01 — round 1 wrote 3,854 tokens, round 2 with the breakpoint
 * moved to a new trailing turn read back all 3,854. A prompt under the model's ~1024-token minimum
 * is simply ignored (no error, no write, no 1.25x penalty), so this is safe on short prompts too.
 */
function applyCacheBreakpoint(messages: Message[]): void {
  stripCacheBreakpoints(messages);
  const last = messages[messages.length - 1];
  if (!last) return;
  // Round 1 carries a bare string; cache_control only exists on block form.
  if (typeof last.content === 'string') {
    last.content = [{ type: 'text', text: last.content }];
  }
  const tail = last.content[last.content.length - 1];
  if (tail) (tail as { cache_control?: CacheControl }).cache_control = { type: 'ephemeral' };
}

function textOf(content: ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return 'No results.';
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join('\n\n');
}

/**
 * Run a prompt through Bedrock with the web_search tool available. Returns the final text plus the
 * sources consulted. Search errors (no key, network) become a "search unavailable" tool result so
 * the model still answers from its own knowledge — the request never fails because search is down.
 */
export async function converseWithSearch(
  prompt: string,
  options: ConverseOptions,
): Promise<ConverseResult> {
  const modelId = options.modelId ?? process.env.BEDROCK_MODEL_ID;
  if (!modelId) throw new Error('BEDROCK_MODEL_ID is not set');

  const webSearch = options.webSearch ?? process.env.AI_WEB_SEARCH === 'true';
  const maxRounds = Math.max(1, options.maxRounds ?? 4);
  const searcher = options.searcher ?? tavilySearch;
  const invoker = options.invoker ?? (await defaultInvoker());
  const cacheEnabled = options.cache ?? true;
  // One request id per converseWithSearch call so all rounds group under it.
  const meter: MeterCtx = {
    feature: options.feature,
    requestId: options.requestId ?? randomUUID(),
    recordDeps: options.recordDeps,
  };

  const messages: Message[] = [{ role: 'user', content: prompt }];
  const sources: SearchResult[] = [];
  const seenUrls = new Set<string>();

  for (let round = 1; round <= maxRounds; round++) {
    // Offer tools every round except the last, so the loop is guaranteed to terminate with prose.
    const offerTools = webSearch && round < maxRounds;

    // On the final round we cut off tools — but a model mid-research will otherwise keep narrating
    // "let me do one more search" and never synthesize. Tell it explicitly that search is closed and
    // it must answer now. Appended as a trailing text block so any prior tool_result stays first.
    if (webSearch && round === maxRounds && maxRounds > 1) {
      const nudge: TextBlock = {
        type: 'text',
        text:
          'Web search is now closed for this task. Do NOT ask to search again. Using everything you ' +
          'have already gathered, produce your final answer now, in full, exactly as instructed above.',
      };
      const last = messages[messages.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        last.content.push(nudge);
      } else {
        messages.push({ role: 'user', content: [nudge] });
      }
    }

    // Cache the transcript ONLY while another tool round is still possible.
    //
    // The final round drops `tools`, which changes the very front of the prompt and invalidates the
    // whole cached prefix — so a breakpoint there would buy nothing and still bill the 1.25x write on
    // the largest transcript of the run. Stripping instead of marking avoids that. Likewise, when web
    // search is off there is only ever one round, so nothing would read the cache and we skip it.
    if (cacheEnabled) {
      if (offerTools) applyCacheBreakpoint(messages);
      else stripCacheBreakpoints(messages);
    }

    const body: Record<string, unknown> = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: options.maxTokens ?? 2048,
      messages,
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.system) body.system = options.system;
    if (offerTools) body.tools = [WEB_SEARCH_TOOL];

    const response = await callModel(invoker, modelId, body, meter);
    const content = response.content ?? [];

    if (response.stop_reason !== 'tool_use' || !offerTools) {
      return { text: textOf(content), sources, rounds: round };
    }

    // Model wants to use a tool — echo its turn, then answer each tool_use.
    messages.push({ role: 'assistant', content });
    const toolResults: ToolResultBlock[] = [];
    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      if (block.name === 'web_search') {
        const query = typeof block.input?.query === 'string' ? block.input.query : '';
        let resultText: string;
        try {
          const results = await searcher(query, { maxResults: options.maxResults ?? 5 });
          for (const r of results) {
            if (r.url && !seenUrls.has(r.url)) {
              seenUrls.add(r.url);
              sources.push(r);
            }
          }
          resultText = formatResults(results);
        } catch (err) {
          // Web-search failures were silent (the model just gets a "search unavailable" tool result and
          // writes a disclaimer). Log them so a degraded result is observable — the key is never logged.
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[web_search] unavailable (query="${query.slice(0, 80)}"): ${message}`);
          resultText = `Search unavailable: ${message}`;
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText });
      } else {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Unknown tool: ${block.name}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }

  // Unreachable in practice (the final round disables tools and returns above), but be safe.
  return { text: '', sources, rounds: maxRounds };
}
