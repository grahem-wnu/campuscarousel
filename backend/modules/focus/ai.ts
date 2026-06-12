// AI layer for the Focus page: a web-grounded prose overview of pursuing the student's intended
// major. Runs ONLY on the async hydration worker (never the request path) because web search routinely
// exceeds the API Gateway 30s budget — see the sync-AI-30s rule. Goes through the shared
// `converseWithSearch` call site (Tavily web_search when AI_WEB_SEARCH is on) and returns the model's
// prose plus the sources it actually consulted, for citation in the UI. Injectable (invoker + searcher)
// so tests run with no network; any error degrades to a thrown error the caller records as `failed`.

import { converseWithSearch, type BedrockInvoker, type WebSearcher } from '../../shared/ai/index.js';
import { majorPhrase } from '../../shared/ai/major.js';
import { packFocusBriefs } from '../../shared/packs/index.js';
import type { FocusSource } from '../../shared/data/index.js';

export type { BedrockInvoker };

export interface FocusOverviewResult {
  overview: string;
  sources: FocusSource[];
}

export type FocusOverviewer = () => Promise<FocusOverviewResult>;

export interface AiOptions {
  modelId?: string;
  /** Inject the shared Bedrock seam (tests); else the real SDK client. */
  invoker?: BedrockInvoker;
  /** Inject the web searcher (tests); else Tavily. */
  searcher?: WebSearcher;
  /** Force web search on/off; defaults to the `AI_WEB_SEARCH` env flag. The worker leaves it on. */
  webSearch?: boolean;
}

/** Build the overview prompt for the active student's major(s), folding in any major-pack guidance
 *  (e.g. nursing → TEAS, direct-admit BSN, clinical hours) so the overview is major-specific. */
export function buildOverviewPrompt(majors: string[], careerGoal?: string): string {
  const phrase = majorPhrase(majors, 'an undergraduate college program');
  const briefs = packFocusBriefs(majors);
  const goalLine = careerGoal ? `The student's stated career goal is "${careerGoal}".` : '';
  return [
    `Write a clear, encouraging overview for a high-school student (and their family) about pursuing ${phrase} in college.`,
    goalLine,
    ...briefs,
    'Use web_search to ground the facts (typical prerequisites, admissions expectations, timeline, career outlook, salary ranges) in current, reputable sources.',
    'Cover, as short markdown sections with `##` headings:',
    '1. What this path involves — the day-to-day of the major and degree.',
    '2. How to prepare in high school — courses, activities, certifications, and any entrance exam.',
    '3. What strong applicants look like — what admissions and competitive programs want.',
    '4. Career outlook — roles, demand, and typical earnings, with a source.',
    '5. Milestones — a rough year-by-year timeline from now through application.',
    'Keep it under ~450 words. Warm, concrete, second person ("you"). Output GitHub-flavored markdown only — no preamble, no code fences.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** A Bedrock-backed overviewer bound to the active student's majors/goal. The worker always runs it
 *  web-grounded; tests inject `invoker`/`searcher` and may force `webSearch:false`. */
export function makeBedrockFocusOverviewer(
  options: AiOptions = {},
  majors: string[] = [],
  careerGoal?: string,
): FocusOverviewer {
  return async () => {
    const { text, sources } = await converseWithSearch(buildOverviewPrompt(majors, careerGoal), {
      modelId: options.modelId,
      invoker: options.invoker,
      searcher: options.searcher,
      webSearch: options.webSearch,
      maxRounds: 6,
      maxTokens: 2048,
    });
    const overview = text.trim();
    if (!overview) throw new Error('focus overview: model returned no text');
    return {
      overview,
      sources: sources.map((s) => ({ title: s.title || s.url, url: s.url })).filter((s) => s.url),
    };
  };
}
