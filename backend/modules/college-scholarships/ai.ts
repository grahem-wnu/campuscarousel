// Bedrock bindings for College Scholarship Research. Both calls are WEB-GROUNDED and therefore run
// only on the 300s SQS worker — never on the request path, which dies at API Gateway's ~30s ceiling
// (see docs/superpowers/specs/2026-08-20-college-scholarship-research-design.md).
//
// Everything is injectable (invoker + searcher) so tests run with no network, and every failure
// degrades rather than throws: search → [], research → null. The caller records that as a 'failed'
// status the UI can offer a retry on.

import { converseWithSearch, type BedrockInvoker, type WebSearcher } from '../../shared/ai/index.js';
import type { ScholarshipResearch } from '../../shared/data/index.js';
import { buildResearchPrompt, parseResearch, type ScholarshipResearcher } from './research.js';
import { buildSearchPrompt, parseSearchResults, SEARCH_LIMIT, type FoundScholarship, type ScholarshipSearcher } from './search.js';

export type { BedrockInvoker };

export interface AiOptions {
  modelId?: string;
  /** Inject the shared Bedrock seam (tests); else the real SDK client. */
  invoker?: BedrockInvoker;
  /** Inject the web searcher (tests); else Tavily. */
  searcher?: WebSearcher;
  /** Force web search on/off; defaults to the `AI_WEB_SEARCH` env flag (on for the workers). */
  webSearch?: boolean;
}

/** Rounds/token budgets. The search is a broad sweep of a handful of pages; the dossier reads more
 *  pages and writes far more, so it gets both more rounds and a much larger output budget.
 *
 *  Both budgets are bounded by the worker's 300s timeout: search rounds cost ~10-20s each and the
 *  final answer costs roughly a second per 60-80 output tokens, so the research ceiling is set at
 *  6000 (a very long dossier) rather than higher — a run that blew past 300s would be redelivered by
 *  SQS mid-write instead of failing cleanly. */
const SEARCH_ROUNDS = 5;
const SEARCH_TOKENS = 4000;
const RESEARCH_ROUNDS = 6;
const RESEARCH_TOKENS = 6000;

/** Web-grounded search for the awards one college offers. Returns [] on any failure. */
export function makeBedrockSearcher(options: AiOptions = {}): ScholarshipSearcher {
  return async ({ collegeName, category, query, sport, majors, state }): Promise<FoundScholarship[]> => {
    try {
      const { text } = await converseWithSearch(
        buildSearchPrompt({ collegeName, category, query, sport, majors, state }),
        {
          feature: 'scholarship-search',
          modelId: options.modelId,
          invoker: options.invoker,
          searcher: options.searcher,
          webSearch: options.webSearch ?? true,
          maxRounds: SEARCH_ROUNDS,
          maxTokens: SEARCH_TOKENS,
        },
      );
      return parseSearchResults(text, SEARCH_LIMIT);
    } catch (err) {
      console.error('[college-scholarships] search failed', err);
      return [];
    }
  };
}

/** Web-grounded deep research on one award. Returns null on any failure (or on output too thin to
 *  be worth showing — see `hasSubstance`), which the job records as 'failed'. */
export function makeBedrockResearcher(options: AiOptions = {}): ScholarshipResearcher {
  return async ({ collegeName, scholarship, majors, gradYear }): Promise<ScholarshipResearch | null> => {
    try {
      const { text, sources } = await converseWithSearch(
        buildResearchPrompt({ collegeName, scholarship, majors, gradYear }),
        {
          feature: 'scholarship-research',
          modelId: options.modelId,
          invoker: options.invoker,
          searcher: options.searcher,
          webSearch: options.webSearch ?? true,
          maxRounds: RESEARCH_ROUNDS,
          maxTokens: RESEARCH_TOKENS,
        },
      );
      const parsed = parseResearch(text);
      if (!parsed) return null;
      // The model is asked to cite its sources, but the loop already knows exactly which pages it
      // read. Fall back to those so a dossier is never shown without provenance.
      if (!parsed.sources?.length && sources.length) {
        parsed.sources = sources
          .filter((s) => typeof s.url === 'string' && /^https?:\/\//.test(s.url))
          .slice(0, 20)
          .map((s) => (s.title ? { url: s.url, title: s.title } : { url: s.url }));
      }
      return parsed;
    } catch (err) {
      console.error('[college-scholarships] research failed', err);
      return null;
    }
  };
}
