// AI layer for Application Central's essay workspace: find-experiences (which of Keira's accumulated
// experiences fit this essay prompt) and review (structural/authenticity feedback — never a rewrite).
// Both go through Bedrock (model/inference-profile from BEDROCK_MODEL_ID env, never hardcoded),
// synchronous, and are injectable so handlers/tests run with a stub client and no network. Any
// error/malformed response degrades gracefully (empty selection / empty feedback) — never throws.
//
// PRIVACY: this layer only ever sees the candidate list the handler passes in, which the handler has
// already narrowed with `aiVisibleSet` off the JWT. The AI receives Keira's private entries only when
// Keira is the authenticated caller; a parent's call never includes them. (Mirrors college-hub/ai.ts.)

import { candidateKey, type ExperienceCandidate } from './experiences.js';

export interface BedrockInvoker {
  send(command: unknown): Promise<{ body?: Uint8Array }>;
}
export interface AiOptions {
  modelId?: string;
  client?: BedrockInvoker;
}

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

const strArr = (v: unknown, max = 12): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()).slice(0, max) : [];

// --- find-experiences -----------------------------------------------------------------------------

export interface SelectedExperience {
  source: ExperienceCandidate['source'];
  id: string;
  title: string;
  why: string;
}
export interface ExperienceSuggestions {
  experiences: SelectedExperience[];
  angles: string[];
}
export interface FindInput {
  prompt?: string;
  focus?: string;
  candidates: ExperienceCandidate[];
  limit?: number;
}
export type ExperienceFinder = (input: FindInput) => Promise<ExperienceSuggestions>;

function buildFindPrompt(input: FindInput): string {
  const lines: string[] = [
    'You are an essay-brainstorming partner for a student applying to nursing (BSN) programs.',
    'From the candidate experiences below, pick the ones most relevant to the essay prompt and',
    'suggest a few distinctive angles. Do NOT write the essay.',
  ];
  if (input.prompt) lines.push(`Essay prompt: ${input.prompt}`);
  if (input.focus) lines.push(`Extra focus: ${input.focus}`);
  lines.push('Candidate experiences (key | title | text):');
  for (const c of input.candidates) lines.push(`- ${candidateKey(c)} | ${c.title} | ${c.text}`);
  lines.push(
    'Respond with ONLY a JSON object (no prose, no code fences):',
    '{"experiences":[{"key": string (one of the keys above), "why": string}], "angles": string[]}',
  );
  return lines.join('\n');
}

/** Bedrock-backed experience finder. Resolves selected keys back to candidates the handler passed in
 *  (so a hallucinated key is dropped). Returns empty suggestions on any failure. */
export function makeBedrockExperienceFinder(options: AiOptions = {}): ExperienceFinder {
  return async (input) => {
    const byKey = new Map(input.candidates.map((c) => [candidateKey(c), c]));
    try {
      const parsed = extractJson(await invokeText(buildFindPrompt(input), options)) as Record<string, unknown>;
      const rawExp = Array.isArray(parsed.experiences) ? parsed.experiences : [];
      const experiences: SelectedExperience[] = [];
      for (const e of rawExp) {
        if (!e || typeof e !== 'object') continue;
        const o = e as Record<string, unknown>;
        const cand = typeof o.key === 'string' ? byKey.get(o.key) : undefined;
        if (!cand) continue;
        experiences.push({
          source: cand.source,
          id: cand.id,
          title: cand.title,
          why: typeof o.why === 'string' ? o.why.trim().slice(0, 500) : '',
        });
        if (experiences.length >= (input.limit ?? 10)) break;
      }
      return { experiences, angles: strArr(parsed.angles) };
    } catch {
      return { experiences: [], angles: [] };
    }
  };
}

// --- review ---------------------------------------------------------------------------------------

export interface EssayFeedback {
  strengths: string[];
  suggestions: string[];
  authenticity: string;
  structure: string;
}
export interface ReviewInput {
  prompt?: string;
  content: string;
}
export type EssayReviewer = (input: ReviewInput) => Promise<EssayFeedback>;

function buildReviewPrompt(input: ReviewInput): string {
  return [
    'You are an essay coach. Give feedback on this draft — strengths, concrete suggestions, an',
    'authenticity read, and a structure note. CRITICAL: do NOT rewrite or draft any prose; feedback',
    'only, so the work stays the student’s own.',
    input.prompt ? `Essay prompt: ${input.prompt}` : '',
    'Draft:',
    input.content,
    'Respond with ONLY a JSON object (no prose, no code fences):',
    '{"strengths": string[], "suggestions": string[], "authenticity": string, "structure": string}',
  ]
    .filter(Boolean)
    .join('\n');
}

const EMPTY_FEEDBACK: EssayFeedback = { strengths: [], suggestions: [], authenticity: '', structure: '' };

/** Bedrock-backed reviewer. Feedback only — never returns rewritten prose. Empty feedback on failure. */
export function makeBedrockReviewer(options: AiOptions = {}): EssayReviewer {
  return async (input) => {
    try {
      const o = extractJson(await invokeText(buildReviewPrompt(input), options)) as Record<string, unknown>;
      return {
        strengths: strArr(o.strengths),
        suggestions: strArr(o.suggestions),
        authenticity: typeof o.authenticity === 'string' ? o.authenticity.trim().slice(0, 2000) : '',
        structure: typeof o.structure === 'string' ? o.structure.trim().slice(0, 2000) : '',
      };
    } catch {
      return { ...EMPTY_FEEDBACK };
    }
  };
}
