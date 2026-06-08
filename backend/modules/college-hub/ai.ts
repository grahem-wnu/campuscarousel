// AI layer for College Hub: discovery (POST /colleges/discover) and hydration (the SQS worker).
// Both go through Bedrock (model/inference-profile from BEDROCK_MODEL_ID env, never hardcoded) and
// are injectable so handlers/worker tests run with a stub client and no network. Any error/timeout/
// malformed response degrades gracefully: discovery → [] (empty candidate list), hydration → a
// `{ hydrationStatus: 'failed' }` patch. The spec also calls for a web-search tool; that is not yet
// available server-side (no shared web client) — Bedrock general knowledge is used meanwhile and the
// gap is noted on the checkpoint, same as the certifications curated fallback.

import type { College } from '../../shared/data/index.js';
import type { DiscoverInput } from './schema.js';

/** Minimal structural type of the Bedrock client (just `send`) — keeps tests injectable without a
 *  hard dependency on the SDK's concrete class. */
export interface BedrockInvoker {
  send(command: unknown): Promise<{ body?: Uint8Array }>;
}

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
  client?: BedrockInvoker;
}

/** Invoke Bedrock (Anthropic Messages) and return the assistant's raw text. Throws on any problem. */
async function invokeText(prompt: string, options: AiOptions): Promise<string> {
  const modelId = options.modelId ?? process.env.BEDROCK_MODEL_ID;
  if (!modelId) throw new Error('BEDROCK_MODEL_ID is not set');
  const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const client: BedrockInvoker =
    options.client ?? (new BedrockRuntimeClient({}) as unknown as BedrockInvoker);
  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(
      JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    ),
  });
  const res = await client.send(command);
  if (!res.body) throw new Error('empty Bedrock response');
  const decoded = JSON.parse(new TextDecoder().decode(res.body)) as {
    content?: Array<{ text?: string }>;
  };
  return (decoded.content ?? []).map((c) => (typeof c?.text === 'string' ? c.text : '')).join('\n');
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
  'tuitionInState', 'tuitionOutOfState', 'estimatedTotalCost', 'estimatedCostAfterAid',
  'acceptanceRateNursing', 'acceptanceRateUniversity', 'avgGPAAdmitted', 'prerequisites',
  'applicationDeadlines', 'essayPrompts', 'requiredTests', 'clinicalPartners', 'specialNotes',
  'website', 'branding', 'contactInfo',
] as const;

/** Keep only allowlisted, defined fields from a parsed hydration object. */
export function pickHydratableFields(raw: unknown): Partial<College> {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of HYDRATABLE_FIELDS) {
    if (o[key] !== undefined && o[key] !== null) out[key] = o[key];
  }
  return out as Partial<College>;
}

function buildHydratePrompt(name: string, state?: string): string {
  return [
    `Provide factual details about the nursing (BSN) program at "${name}"${state ? `, ${state}` : ''}.`,
    'Respond with ONLY a JSON object (no prose, no code fences) using these keys where known:',
    'location, state, programType, isDirectAdmit, hasBSN, hasAcceleratedBSN, ranking,',
    'tuitionInState, tuitionOutOfState, estimatedTotalCost, acceptanceRateNursing,',
    'acceptanceRateUniversity, avgGPAAdmitted, prerequisites (string[]), applicationDeadlines',
    '({earlyAction,regularDecision,nursingApp}), essayPrompts (string[]), requiredTests (string[]),',
    'clinicalPartners (string[]), specialNotes, website, branding ({logoUrl,primaryColor,',
    'secondaryColor,mascot}), contactInfo ({nursingAdmissionsUrl,nursingAdmissionsPhone,...}).',
    'Omit any field you are unsure of rather than guessing.',
  ].join('\n');
}

/**
 * Bedrock-backed hydrator. Returns a `Partial<College>` of allowlisted fields plus a
 * `hydrationStatus`: 'complete' on success, 'failed' on any error (the worker merges this so the
 * frontend's poll sees the outcome). Never throws.
 */
export function makeBedrockHydrator(options: AiOptions = {}): Hydrator {
  return async ({ name, state }) => {
    try {
      const text = await invokeText(buildHydratePrompt(name, state), options);
      const fields = pickHydratableFields(extractJson(text));
      return { ...fields, hydrationStatus: 'complete' };
    } catch {
      return { hydrationStatus: 'failed' };
    }
  };
}
