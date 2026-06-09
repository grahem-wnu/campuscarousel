// AI layer for College Hub: discovery (POST /colleges/discover) and hydration (the SQS worker).
// Both go through the shared web-grounded Bedrock call site (`converseWithSearch`): when the
// `AI_WEB_SEARCH` env flag is on (it is, on the API + worker Lambdas), the model can call the
// `web_search` tool (Tavily) to ground deadlines/tuition/rankings in live sources, then we parse its
// final JSON; when the flag is off or search is unconfigured, it degrades to model knowledge — the
// exact prior behaviour. Hydration aims for a *rich, decision-ready* profile: a narrative overview +
// admissions deep-dive, real net price (distinct from tuition), testimonials, campus images, and the
// source URLs the model actually consulted (folded into `dataSources` for citation in the UI).
// Everything stays injectable (invoker + searcher) so tests run with no network. Any error/timeout/
// malformed response still degrades gracefully: discovery → [] (empty list), hydration → a
// `{ hydrationStatus: 'failed' }` patch.

import { converseWithSearch, type BedrockInvoker, type WebSearcher } from '../../shared/ai/index.js';
import type { College } from '../../shared/data/index.js';
import type { DiscoverInput } from './schema.js';

export type { BedrockInvoker };

/** A discovered candidate — College-shaped, name required, plus a short rationale. */
export interface CollegeCandidate {
  name: string;
  location?: string;
  state?: string;
  programType?: College['programType'];
  isDirectAdmit?: boolean;
  hasBSN?: boolean;
  ranking?: string;
  tuitionInState?: number;
  tuitionOutOfState?: number;
  website?: string;
  summary?: string;
}

export type Discoverer = (input: DiscoverInput) => Promise<CollegeCandidate[]>;
export type Hydrator = (input: { name: string; state?: string }) => Promise<Partial<College>>;

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
    modelId: options.modelId,
    invoker: options.invoker,
    searcher: options.searcher,
    webSearch: options.webSearch,
    maxTokens: 2048,
  });
  return text;
}

/** Pull the first JSON value (object or array) out of model text, tolerating prose / code fences. */
export function extractJson(text: string): unknown {
  const fenced = text.replace(/```(?:json)?/gi, '');
  const objStart = fenced.indexOf('{');
  const arrStart = fenced.indexOf('[');
  const start =
    arrStart === -1 ? objStart : objStart === -1 ? arrStart : Math.min(objStart, arrStart);
  if (start === -1) throw new Error('no JSON in model output');
  const open = fenced[start];
  const close = open === '[' ? ']' : '}';
  const end = fenced.lastIndexOf(close);
  if (end <= start) throw new Error('unterminated JSON in model output');
  return JSON.parse(fenced.slice(start, end + 1));
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

/** Trimmed, non-empty strings from an array; undefined if none survive. */
const strArray = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(str).filter((s): s is string => s !== undefined);
  return out.length ? out : undefined;
};
/** Only http(s) URLs from an array (model image/source URLs are best-effort and often junk). */
const urlArray = (v: unknown): string[] | undefined => {
  const arr = strArray(v);
  const out = arr?.filter((u) => /^https?:\/\//i.test(u));
  return out && out.length ? out : undefined;
};
/** Coerce testimonials, keeping only entries with a real quote; attribution/source optional. */
const testimonialArray = (
  v: unknown,
): { quote: string; attribution?: string; source?: string }[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out: { quote: string; attribution?: string; source?: string }[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const quote = str(o.quote);
    if (!quote) continue;
    out.push({ quote, attribution: str(o.attribution), source: str(o.source) });
  }
  return out.length ? out : undefined;
};

const PROGRAM_TYPES = new Set(['direct-admit-BSN', 'pre-nursing-secondary-app', 'ABSN-only', 'RN-to-BSN-only']);
const programType = (v: unknown): College['programType'] | undefined =>
  typeof v === 'string' && PROGRAM_TYPES.has(v) ? (v as College['programType']) : undefined;

/** Coerce one raw object into a CollegeCandidate, or null if it has no usable name. */
function toCandidate(raw: unknown): CollegeCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = str(o.name);
  if (!name) return null;
  return {
    name,
    location: str(o.location),
    state: str(o.state),
    programType: programType(o.programType),
    isDirectAdmit: bool(o.isDirectAdmit),
    hasBSN: bool(o.hasBSN),
    ranking: str(o.ranking),
    tuitionInState: num(o.tuitionInState),
    tuitionOutOfState: num(o.tuitionOutOfState),
    website: str(o.website),
    summary: str(o.summary),
  };
}

function buildDiscoverPrompt(input: DiscoverInput): string {
  const wants: string[] = ['BSN (Bachelor of Science in Nursing) programs'];
  if (input.state) wants.push(`in ${input.state}`);
  if (input.programType) wants.push(`of program type ${input.programType}`);
  if (input.directAdmitOnly) wants.push('that offer direct-admit BSN');
  if (input.maxTuition) wants.push(`with annual tuition under $${input.maxTuition}`);
  if (input.query) wants.push(`matching: "${input.query}"`);
  const limit = input.limit ?? 8;
  return [
    `List up to ${limit} U.S. colleges with ${wants.join(', ')}.`,
    'Respond with ONLY a JSON array (no prose, no code fences). Each element:',
    '{"name": string, "location": string, "state": string,',
    '"programType": "direct-admit-BSN"|"pre-nursing-secondary-app"|"ABSN-only"|"RN-to-BSN-only",',
    '"isDirectAdmit": boolean, "hasBSN": boolean, "ranking": string,',
    '"tuitionInState": number, "tuitionOutOfState": number, "website": string,',
    '"summary": string (one sentence on its nursing program)}.',
  ].join('\n');
}

/** Bedrock-backed discoverer. Returns [] on any failure so the endpoint never throws. */
export function makeBedrockDiscoverer(options: AiOptions = {}): Discoverer {
  return async (input) => {
    try {
      const text = await invokeText(buildDiscoverPrompt(input), options);
      const json = extractJson(text);
      if (!Array.isArray(json)) return [];
      const limit = input.limit ?? 8;
      return json.map(toCandidate).filter((c): c is CollegeCandidate => c !== null).slice(0, limit);
    } catch {
      return [];
    }
  };
}

/** College fields the hydrator is allowed to write (everything AI-discoverable; never ids/stamps/
 *  userEdited/status/isTopPick — those are user/system-owned). */
const HYDRATABLE_FIELDS = [
  'location', 'state', 'programType', 'isDirectAdmit', 'hasBSN', 'hasAcceleratedBSN', 'ranking',
  'overview', 'admissionsDeepDive', 'nclexPassRate', 'employmentRate',
  'tuitionInState', 'tuitionOutOfState', 'costOfAttendanceOutOfState', 'estimatedNetPriceAfterAid',
  'percentReceivingAid', 'avgAidAmount', 'applicationFee', 'estimatedTotalCost', 'estimatedCostAfterAid',
  'acceptanceRateNursing', 'acceptanceRateUniversity', 'avgGPAAdmitted', 'prerequisites',
  'applicationDeadlines', 'essayPrompts', 'requiredTests', 'clinicalPartners',
  'testimonials', 'campusImageUrls', 'specialNotes', 'website', 'dataSources', 'dataAsOf',
  'branding', 'contactInfo',
] as const;

/** Per-field cleaners for the structured/best-effort fields; everything else is copied as-is
 *  (matching the long-standing behaviour for scalars and simple arrays). */
const COERCE: Partial<Record<(typeof HYDRATABLE_FIELDS)[number], (v: unknown) => unknown>> = {
  testimonials: testimonialArray,
  campusImageUrls: urlArray,
  dataSources: urlArray,
};

/** Keep only allowlisted, defined fields from a parsed hydration object, cleaning the structured ones. */
export function pickHydratableFields(raw: unknown): Partial<College> {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of HYDRATABLE_FIELDS) {
    const v = o[key];
    if (v === undefined || v === null) continue;
    const coerce = COERCE[key];
    if (coerce) {
      const cleaned = coerce(v);
      if (cleaned !== undefined) out[key] = cleaned;
    } else {
      out[key] = v;
    }
  }
  return out as Partial<College>;
}

function buildHydratePrompt(name: string, state?: string): string {
  const where = state ? `, ${state}` : '';
  const year = new Date().getFullYear();
  return [
    `You are a college research analyst building a rich, decision-ready profile of the nursing (BSN)`,
    `program at "${name}"${where} for a prospective undergraduate applicant and her family.`,
    '',
    'USE THE web_search TOOL to ground every number — do NOT rely on prior knowledge for tuition, GPA,',
    `acceptance rate, deadlines, or rankings; these change yearly and must be verified against ${year}-${year + 1}`,
    'sources. Search EFFICIENTLY: roughly 5-9 well-chosen queries is plenty. Cover DIFFERENT source types,',
    'because no single site has everything:',
    "  - The college's own nursing site (.edu) — program structure, prerequisites, deadlines, clinical partners.",
    '  - U.S. News / Niche — rankings and reputation.',
    "  - College Navigator / NCES, collegetuitioncompare, the school's financial-aid office — cost of",
    '    attendance, NET PRICE after aid, and % receiving aid.',
    '  - Common Data Set / admissions-stats sites — average ADMITTED GPA and acceptance rate (these are',
    "    rarely on the college's own marketing pages, so search the wider web for them specifically).",
    '  - Niche / Cappex / Reddit — authentic student testimonials about the nursing program.',
    'As soon as you have enough to fill the fields below, STOP searching and output the final JSON',
    'object. Do not keep searching for marginal details — partial data delivered beats perfect data',
    'that never arrives.',
    '',
    'CRITICAL ACCURACY RULES:',
    '  - Separate NURSING-program stats (BSN/direct-admit acceptance rate, nursing GPA) from',
    '    UNIVERSITY-WIDE stats. Use acceptanceRateNursing vs acceptanceRateUniversity accordingly.',
    '  - estimatedNetPriceAfterAid is the cost AFTER grants & scholarships and is DIFFERENT from tuition.',
    '    Make a DEDICATED search for it — College Navigator (nces.ed.gov) publishes an "Average net',
    '    price" figure for nearly every U.S. college, and collegetuitioncompare lists it too. Report',
    '    that number. NEVER copy tuition into it. If you truly cannot find it, leave it out entirely.',
    '  - Prefer PARTIAL data over blanks: include any value you can find. Only omit a field if it is',
    '    genuinely unavailable after searching. NEVER fabricate a number — an omitted field is fine, a',
    '    wrong one is not.',
    '',
    'Write a genuine NARRATIVE, not bullet fragments:',
    '  - overview: 2-3 paragraphs on what makes this school and its nursing program distinctive —',
    '    reputation, teaching hospital / clinical network, culture, outcomes (NCLEX pass rate, employment),',
    "    and who it's a good fit for.",
    '  - admissionsDeepDive: 1-2 paragraphs walking through exactly how a student gets in — every pathway',
    '    (direct admit vs. secondary application), what each requires, the real timeline, selectivity, and',
    '    the most important things an applicant must nail.',
    '',
    'Respond with ONLY a JSON object (no prose, no code fences) using these keys where known:',
    '  overview (string), admissionsDeepDive (string), programType',
    '  ("direct-admit-BSN"|"pre-nursing-secondary-app"|"ABSN-only"|"RN-to-BSN-only"), isDirectAdmit (bool),',
    '  hasBSN (bool), hasAcceleratedBSN (bool), ranking (string), nclexPassRate (string),',
    '  employmentRate (string), tuitionInState (number), tuitionOutOfState (number),',
    '  costOfAttendanceOutOfState (number), estimatedNetPriceAfterAid (number), percentReceivingAid',
    '  (string), avgAidAmount (number), applicationFee (number), acceptanceRateNursing (string),',
    '  acceptanceRateUniversity (string), avgGPAAdmitted (string), prerequisites (string[]),',
    '  applicationDeadlines ({earlyAction, regularDecision, nursingApp}), essayPrompts (string[]),',
    '  requiredTests (string[]), clinicalPartners (string[]),',
    '  testimonials ([{quote, attribution, source}] — verbatim student quotes, each with a source URL),',
    '  campusImageUrls (string[] — direct https URLs to campus/program photos), location (string),',
    '  state (2-letter), website (string), branding ({logoUrl, primaryColor (hex), secondaryColor (hex),',
    '  mascot}), contactInfo ({nursingAdmissionsUrl, nursingAdmissionsPhone, nursingAdmissionsEmail,',
    '  financialAidUrl, financialAidPhone, campusVisitUrl}), specialNotes (string),',
    '  dataSources (string[] — every URL you relied on), dataAsOf (string — the academic year these',
    `  figures reflect, e.g. "${year}-${year + 1}").`,
  ].join('\n');
}

/** Union two URL lists, de-duplicated, order-stable; undefined if empty. */
function mergeSources(modelListed: string[] | undefined, consulted: string[]): string[] | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [...(modelListed ?? []), ...consulted]) {
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out.length ? out : undefined;
}

/**
 * Bedrock-backed hydrator. Calls the shared web-grounded loop directly so it can fold the URLs the
 * model actually consulted into `dataSources` (so the UI can cite them even if the model forgets to
 * list them itself). Returns a `Partial<College>` of allowlisted fields plus a `hydrationStatus`:
 * 'complete' on success, 'failed' on any error (the worker merges this so the frontend's poll sees
 * the outcome). The narrative + many-field prompt needs more room, so we raise the token ceiling.
 * Never throws.
 */
export function makeBedrockHydrator(options: AiOptions = {}): Hydrator {
  return async ({ name, state }) => {
    try {
      const { text, sources } = await converseWithSearch(buildHydratePrompt(name, state), {
        modelId: options.modelId,
        invoker: options.invoker,
        searcher: options.searcher,
        webSearch: options.webSearch,
        // Rich profile = several searches THEN a long synthesis. The default 4 rounds let the model
        // burn every round searching and leave none to write the JSON; give it room + a synthesis round.
        maxRounds: 7,
        maxTokens: 8192,
      });
      const fields = pickHydratableFields(extractJson(text));
      const consulted = sources.map((s) => s.url).filter((u): u is string => typeof u === 'string' && !!u);
      const dataSources = mergeSources(fields.dataSources, consulted);
      return { ...fields, ...(dataSources ? { dataSources } : {}), hydrationStatus: 'complete' };
    } catch {
      return { hydrationStatus: 'failed' };
    }
  };
}
