// Public surface of the shared AI contract. AI handlers (college-hub discovery/hydration,
// peer-benchmark, ai-assistant) import from `backend/shared/ai` (this index) — one shared call
// site for web-grounded Bedrock so behaviour is consistent and tested once.

export { converseWithSearch } from './bedrock.js';
export type { ConverseOptions, ConverseResult, BedrockInvoker } from './bedrock.js';

export { tavilySearch, getTavilyKey, SearchNotConfiguredError } from './search.js';
export type { SearchResult, SearchOptions, WebSearcher } from './search.js';
