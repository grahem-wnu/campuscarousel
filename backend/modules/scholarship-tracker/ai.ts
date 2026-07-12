// AI layer for Scholarship Tracker: discovery (POST /scholarships/discover, synchronous) and
// hydration (refresh one scholarship's details). Both go through Bedrock (model/inference-profile
// from BEDROCK_MODEL_ID env, never hardcoded) and are injectable so handlers/worker tests run with a
// stub client and no network. Any error/timeout/malformed response degrades gracefully: discovery →
// [] (empty candidate list), hydration → a `{ hydrationStatus: 'failed' }` patch. Mirrors
// backend/modules/college-hub/ai.ts.
//
// Both go through the shared web-grounded Bedrock call site (`converseWithSearch`): when the
// `AI_WEB_SEARCH` env flag is on (it is, on the API + worker Lambdas), the model can call the
// `web_search` tool (Tavily) to ground scholarship amounts/deadlines/eligibility in live sources,
// then we parse its final JSON; when off or unconfigured it degrades to model knowledge — the exact
// prior behaviour. Everything stays injectable (invoker + searcher) so tests run with no network.
// The discovery prompt still instructs "do not invent", and parsed URLs are kept only when real.

import { converseWithSearch, type BedrockInvoker, type WebSearcher } from '../../shared/ai/index.js';
import type { Scholarship } from '../../shared/data/index.js';
import { buildDiscoverPrompt, parseDiscoverResults, type DiscoveredScholarship, type ScholarshipDiscoverer } from './discover.js';
import type { DiscoverInput } from './schema.js';

export type { BedrockInvoker };

export interface AiOptions {
  modelId?: string;
  /** Inject the shared Bedrock seam (tests); else the real SDK client. */
  invoker?: BedrockInvoker;
  /** Inject the web searcher (tests); else Tavily. */
  searcher?: WebSearcher;
  /** Force web search on/off; defaults to the `AI_WEB_SEARCH` env flag. */
  webSearch?: boolean;
}

/** Run a prompt through the shared web-grounded Bedrock loop and return the model's final text.
 *  Web search is used when `AI_WEB_SEARCH` is on; otherwise it answers from model knowledge.
 *  Throws on a missing model id / invoker error — callers catch and degrade. */
async function invokeText(prompt: string, options: AiOptions): Promise<string> {
  const { text } = await converseWithSearch(prompt, {
    feature: 'scholarship',
    modelId: options.modelId,
    invoker: options.invoker,
    searcher: options.searcher,
    webSearch: options.webSearch,
    maxTokens: 2048,
  });
  return text;
}

/** Bedrock-backed discoverer (synchronous; fits the routing Lambda's budget for a single search).
 *  Returns [] on any failure so the endpoint never throws. */
export function makeBedrockDiscoverer(options: AiOptions = {}): ScholarshipDiscoverer {
  return {
    async discover(input: DiscoverInput, majors: string[] = []): Promise<DiscoveredScholarship[]> {
      try {
        const text = await invokeText(buildDiscoverPrompt(input, majors), options);
        return parseDiscoverResults(text, input.count ?? 20);
      } catch {
        return [];
      }
    },
  };
}

// --- Hydration ------------------------------------------------------------------------------------

export type Hydrator = (input: { name: string; provider?: string }) => Promise<Partial<Scholarship>>;

/** Fields the hydrator may write — AI-discoverable facts only. Never name (the anchor), status,
 *  awardedAmount, notes, linkedColleges, addedBy (user/system-owned). */
const HYDRATABLE_FIELDS = [
  'provider',
  'amount',
  'amountDescription',
  'type',
  'eligibility',
  'applicationDeadline',
  'applicationUrl',
  'requiredMaterials',
  'isRenewable',
  'renewalRequirements',
] as const;

/** Keep only allowlisted, defined fields from a parsed hydration object. */
export function pickHydratableFields(raw: unknown): Partial<Scholarship> {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of HYDRATABLE_FIELDS) {
    if (o[key] !== undefined && o[key] !== null) out[key] = o[key];
  }
  return out as Partial<Scholarship>;
}

function buildHydratePrompt(name: string, provider?: string): string {
  return [
    `Provide factual details about the scholarship "${name}"${provider ? ` from ${provider}` : ''}.`,
    'Respond with ONLY a JSON object (no prose, no code fences) using these keys where known:',
    'provider, amount (number USD), amountDescription, type (one of: merit, need-based,',
    'major-specific, community-service, diversity, state-specific, organization, other),',
    'eligibility (string[]), applicationDeadline ("YYYY-MM-DD"), applicationUrl,',
    'requiredMaterials (string[]), isRenewable (boolean), renewalRequirements.',
    'Omit any field you are unsure of rather than guessing. Do not invent a URL.',
  ].join('\n');
}

/** Pull the first JSON object/array out of model text, tolerating prose / code fences. */
export function extractJson(text: string): unknown {
  const fenced = text.replace(/```(?:json)?/gi, '');
  const objStart = fenced.indexOf('{');
  const arrStart = fenced.indexOf('[');
  const start = arrStart === -1 ? objStart : objStart === -1 ? arrStart : Math.min(objStart, arrStart);
  if (start === -1) throw new Error('no JSON in model output');
  const open = fenced[start];
  const close = open === '[' ? ']' : '}';
  const end = fenced.lastIndexOf(close);
  if (end <= start) throw new Error('unterminated JSON in model output');
  return JSON.parse(fenced.slice(start, end + 1));
}

/**
 * Bedrock-backed hydrator. Returns a `Partial<Scholarship>` of allowlisted fields plus a
 * `hydrationStatus`: 'complete' on success, 'failed' on any error (the caller merges this so the
 * frontend's poll sees the outcome). Never throws.
 */
export function makeBedrockHydrator(options: AiOptions = {}): Hydrator {
  return async ({ name, provider }) => {
    try {
      const fields = pickHydratableFields(extractJson(await invokeText(buildHydratePrompt(name, provider), options)));
      return { ...fields, hydrationStatus: 'complete' };
    } catch {
      return { hydrationStatus: 'failed' };
    }
  };
}
