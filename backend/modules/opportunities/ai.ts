// Web-grounded opportunity discovery (v2.1 Module 18). Mirrors college-hub: a prompt seeded with the
// requested type + location runs through the shared converseWithSearch loop (Tavily-backed when
// AI_WEB_SEARCH is on), then we parse a JSON array of candidates. Returns [] on any failure so the
// endpoint never throws. NEVER fabricates — the prompt insists on real, currently-listed programs.

import { converseWithSearch, type BedrockInvoker, type WebSearcher } from '../../shared/ai/index.js';
import { majorPhrase } from '../../shared/ai/major.js';
import { packFocusBriefs } from '../../shared/packs/index.js';
import type { OpportunityCandidate, OpportunityType } from '../../shared/data/index.js';

export interface DiscoverInput {
  type?: OpportunityType;
  location?: string;
  query?: string;
  limit?: number;
}

export type Discoverer = (input: DiscoverInput) => Promise<OpportunityCandidate[]>;

export interface AiOptions {
  modelId?: string;
  invoker?: BedrockInvoker;
  searcher?: WebSearcher;
  webSearch?: boolean;
}

const TYPES: OpportunityType[] = [
  'hospital-volunteer',
  'shadowing',
  'cna-program',
  'summer-program',
  'job',
  'club',
  'other',
];

/** Pull the first JSON value (object or array) out of model text, tolerating prose / code fences. */
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

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const strArray = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(str).filter((s): s is string => !!s);
  return out.length ? out : undefined;
};
const oppType = (v: unknown): OpportunityType | undefined =>
  typeof v === 'string' && (TYPES as string[]).includes(v) ? (v as OpportunityType) : undefined;

/** Coerce one raw object into an OpportunityCandidate, or null if it has no usable name. */
function toCandidate(raw: unknown): OpportunityCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = str(o.name);
  if (!name) return null;
  return {
    name,
    organization: str(o.organization),
    type: oppType(o.type),
    location: str(o.location),
    distanceNote: str(o.distanceNote),
    description: str(o.description),
    eligibility: strArray(o.eligibility),
    timeCommitment: str(o.timeCommitment),
    cost: num(o.cost),
    applicationUrl: str(o.applicationUrl),
    applicationDeadline: str(o.applicationDeadline),
  };
}

export function buildDiscoverPrompt(input: DiscoverInput, majors: string[] = []): string {
  const limit = input.limit ?? 8;
  const kind =
    input.type === 'hospital-volunteer'
      ? 'hospital/health-system volunteer programs'
      : input.type === 'shadowing'
        ? 'nurse/clinician job-shadowing programs'
        : input.type === 'cna-program'
          ? 'CNA (Certified Nursing Assistant) training programs'
          : input.type === 'summer-program'
            ? 'summer healthcare/pre-nursing programs for high schoolers'
            : 'volunteer, shadowing, CNA-training, and summer healthcare programs';
  const where = input.location ? `near ${input.location}` : 'in the United States';
  const extra = input.query ? ` Also match: "${input.query}".` : '';
  const career = majorPhrase(majors, 'nursing (BSN)');
  const guidance = packFocusBriefs(majors);
  const focus = guidance.length ? `\nMajor-specific guidance: ${guidance.join(' ')}` : '';
  return [
    `Find up to ${limit} real ${kind} ${where} suitable for a high-school student preparing for a`,
    `${career} career.${extra}${focus}`,
    'Use web_search to verify they currently exist and accept high-schoolers (a few targeted searches',
    'are enough), then STOP searching and output the result. NEVER invent a program or contact —',
    'omit a field if you cannot verify it; partial data is fine.',
    'Respond with ONLY a JSON array (no prose, no code fences). Each element:',
    '{"name": string, "organization": string, "type":',
    '"hospital-volunteer"|"shadowing"|"cna-program"|"summer-program"|"job"|"club"|"other",',
    '"location": string, "distanceNote": string, "description": string (one sentence),',
    '"eligibility": string[], "timeCommitment": string, "cost": number (0 if free),',
    '"applicationUrl": string, "applicationDeadline": "YYYY-MM-DD" (omit if none)}.',
  ].join('\n');
}

async function invokeText(prompt: string, options: AiOptions): Promise<string> {
  const { text } = await converseWithSearch(prompt, {
    modelId: options.modelId,
    invoker: options.invoker,
    searcher: options.searcher,
    webSearch: options.webSearch,
    maxRounds: 7,
    maxTokens: 4096,
  });
  return text;
}

/** Bedrock-backed discoverer. Returns [] on any failure so the endpoint never throws. With `majors`
 *  set, the search targets that academic focus (+ pack guidance); with none it stays nursing-default. */
export function makeBedrockDiscoverer(options: AiOptions = {}, majors: string[] = []): Discoverer {
  return async (input) => {
    try {
      const text = await invokeText(buildDiscoverPrompt(input, majors), options);
      const json = extractJson(text);
      if (!Array.isArray(json)) return [];
      const limit = input.limit ?? 8;
      return json
        .map(toCandidate)
        .filter((c): c is OpportunityCandidate => c !== null)
        .slice(0, limit);
    } catch {
      return [];
    }
  };
}
