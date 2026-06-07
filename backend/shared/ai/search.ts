// Tavily web-search client. Bedrock/Claude has no native web-search tool, so AI handlers ground
// their answers by calling this through the `web_search` custom tool wired in `bedrock.ts`.
//
// The API key is resolved lazily and cached: `TAVILY_API_KEY` env wins (tests / local), otherwise
// the SSM SecureString at `${SSM_PREFIX}/tavilyApiKey` (decrypted at runtime — the Lambda role has
// ssm:GetParameter on /keiras-journey/<env>/*, and the AWS-managed `alias/aws/ssm` key needs no
// extra grant). No key configured -> SearchNotConfiguredError, so callers degrade gracefully
// (mirrors the suggesters' clean 503 path). The key is never logged.

/** One search hit. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  /** Max results to return (Tavily default 5). */
  maxResults?: number;
}

/** A web searcher — injected into the Bedrock loop so tests run without network. */
export type WebSearcher = (query: string, opts?: SearchOptions) => Promise<SearchResult[]>;

/** Thrown when no Tavily key is configured. Callers catch and degrade (no web grounding). */
export class SearchNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchNotConfiguredError';
  }
}

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

let cachedKey: Promise<string> | undefined;

/** For tests: drop the cached key promise so a fresh resolution path runs. */
export function resetKeyCacheForTest(): void {
  cachedKey = undefined;
}

/**
 * Resolve the Tavily API key. `TAVILY_API_KEY` env takes precedence (tests/local); otherwise read
 * the SSM SecureString named by `TAVILY_SSM_PARAM` or `${SSM_PREFIX}/tavilyApiKey`. Cached after the
 * first success; a failure clears the cache so a later call can retry.
 */
export function getTavilyKey(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const direct = env.TAVILY_API_KEY;
  if (direct) return Promise.resolve(direct);
  if (!cachedKey) {
    cachedKey = readKeyFromSsm(env).catch((err) => {
      cachedKey = undefined;
      throw err;
    });
  }
  return cachedKey;
}

async function readKeyFromSsm(env: NodeJS.ProcessEnv): Promise<string> {
  const name =
    env.TAVILY_SSM_PARAM ?? (env.SSM_PREFIX ? `${env.SSM_PREFIX}/tavilyApiKey` : undefined);
  if (!name) {
    throw new SearchNotConfiguredError(
      'Tavily key unavailable: set TAVILY_API_KEY, or SSM_PREFIX/TAVILY_SSM_PARAM for the SSM read',
    );
  }
  const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
  const client = new SSMClient({});
  const res = await client.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = res.Parameter?.Value;
  if (!value) throw new SearchNotConfiguredError(`Tavily key not found at SSM parameter ${name}`);
  return value;
}

/**
 * Query Tavily. Throws `SearchNotConfiguredError` if no key is configured; network/HTTP failures
 * propagate (the Bedrock loop turns them into a "search unavailable" tool result rather than
 * failing the whole request). The key is sent in the request body, never logged.
 */
export const tavilySearch: WebSearcher = async (query, opts = {}) => {
  const apiKey = await getTavilyKey();
  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: opts.maxResults ?? 5,
      search_depth: 'basic',
    }),
  });
  if (!res.ok) {
    throw new Error(`Tavily search failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results ?? []).map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.content ?? '',
  }));
};
