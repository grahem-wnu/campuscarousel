// AI layer for Scholarship Tracker: discovery (POST /scholarships/discover, synchronous) and
// hydration (refresh one scholarship's details). Both go through Bedrock (model/inference-profile
// from BEDROCK_MODEL_ID env, never hardcoded) and are injectable so handlers/worker tests run with a
// stub client and no network. Any error/timeout/malformed response degrades gracefully: discovery →
// [] (empty candidate list), hydration → a `{ hydrationStatus: 'failed' }` patch. Mirrors
// backend/modules/college-hub/ai.ts.
//
// The spec also calls for a web-search tool; that is not yet available server-side (no shared web
// client) — Bedrock general knowledge is used meanwhile and the gap is noted on the checkpoint, same
// as college-hub. The discovery prompt still instructs "do not invent", and parsed URLs are kept
// only when they look like real links.

import type { Scholarship } from '../../shared/data/index.js';
import { buildDiscoverPrompt, parseDiscoverResults, type DiscoveredScholarship, type ScholarshipDiscoverer } from './discover.js';
import type { DiscoverInput } from './schema.js';

/** Minimal structural type of the Bedrock client (just `send`) — keeps tests injectable without a
 *  hard dependency on the SDK's concrete class. */
export interface BedrockInvoker {
  send(command: unknown): Promise<{ body?: Uint8Array }>;
}

export interface AiOptions {
  modelId?: string;
  client?: BedrockInvoker;
}

/** Invoke Bedrock (Anthropic Messages) and return the assistant's raw text. Throws on any problem. */
async function invokeText(prompt: string, options: AiOptions): Promise<string> {
  const modelId = options.modelId ?? process.env.BEDROCK_MODEL_ID;
  if (!modelId) throw new Error('BEDROCK_MODEL_ID is not set');
  const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const client: BedrockInvoker = options.client ?? (new BedrockRuntimeClient({}) as unknown as BedrockInvoker);
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
  const decoded = JSON.parse(new TextDecoder().decode(res.body)) as { content?: Array<{ text?: string }> };
  return (decoded.content ?? []).map((c) => (typeof c?.text === 'string' ? c.text : '')).join('\n');
}

/** Bedrock-backed discoverer (synchronous; fits the routing Lambda's budget for a single search).
 *  Returns [] on any failure so the endpoint never throws. */
export function makeBedrockDiscoverer(options: AiOptions = {}): ScholarshipDiscoverer {
  return {
    async discover(input: DiscoverInput): Promise<DiscoveredScholarship[]> {
      try {
        const text = await invokeText(buildDiscoverPrompt(input), options);
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
    'nursing-specific, community-service, diversity, state-specific, organization, other),',
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
