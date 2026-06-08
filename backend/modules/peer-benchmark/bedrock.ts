// Bedrock binding for the benchmark researcher. The prompt builders, output parsers, and composition
// logic live in researcher.ts (pure + tested). This file builds the ModelInvoker over the shared
// web-grounded call site (`converseWithSearch`): when AI_WEB_SEARCH is on (it is, on the API Lambda),
// the model can call the web_search tool (Tavily) to ground typical-admit benchmarks (GPA/TEAS/SAT,
// clinical/volunteer norms) in live sources, then we parse its JSON; off/unconfigured → model
// knowledge, the prior behaviour. The model id comes from BEDROCK_MODEL_ID (never hardcoded).

import { converseWithSearch, type BedrockInvoker, type WebSearcher } from '../../shared/ai/index.js';
import { makeResearcher, unavailableResearcher, type BenchmarkResearcher, type ModelInvoker } from './researcher.js';

/** Build a web-grounded ModelInvoker. Injectable (invoker + searcher + flag) for tests; in prod it
 *  uses the real SDK client + Tavily, gated by the AI_WEB_SEARCH env flag. */
export function makeWebGroundedInvoker(
  options: { invoker?: BedrockInvoker; searcher?: WebSearcher; webSearch?: boolean } = {},
): ModelInvoker {
  return async (prompt) => {
    const { text } = await converseWithSearch(prompt, {
      maxTokens: 1500,
      temperature: 0.4,
      invoker: options.invoker,
      searcher: options.searcher,
      webSearch: options.webSearch,
    });
    return text;
  };
}

const realResearcher = makeResearcher(makeWebGroundedInvoker());

/**
 * Production researcher: the real web-grounded researcher when BEDROCK_MODEL_ID is configured (the
 * deployed Lambda), else the clean 503 placeholder (local/unconfigured). Decided per-call so it
 * tracks the environment rather than import-time state.
 */
export const bedrockResearcher: BenchmarkResearcher = {
  research: (college, focus) =>
    process.env.BEDROCK_MODEL_ID
      ? realResearcher.research(college, focus)
      : unavailableResearcher.research(college, focus),
  analyzeGaps: (stats, rows) =>
    process.env.BEDROCK_MODEL_ID
      ? realResearcher.analyzeGaps(stats, rows)
      : unavailableResearcher.analyzeGaps(stats, rows),
};
