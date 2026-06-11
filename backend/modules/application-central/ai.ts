// AI essay partner for Application Central. Two capabilities, both Bedrock-backed behind an injectable
// seam with deterministic curated fallback (model id from BEDROCK_MODEL_ID, never hardcoded):
//   • findExperiences — surface the logged experiences + angles most relevant to a prompt.
//   • reviewEssay     — structural/authenticity feedback on a draft. NEVER rewrites the essay.
// Both receive an already-privacy-filtered ExperiencePool (grounding.ts), so this layer can't leak
// private entries and its output is returned live (never persisted).

import { poolToText, type Experience, type ExperiencePool } from './grounding.js';

export interface BedrockInvoker {
  send(command: unknown): Promise<{ body?: Uint8Array }>;
}
export interface AiOptions {
  modelId?: string;
  client?: BedrockInvoker;
}

export interface ExperienceSuggestion {
  title: string;
  kind: Experience['kind'];
  why: string;
}
export interface FindResult {
  suggestedExperiences: ExperienceSuggestion[];
  angles: string[];
  source: 'ai' | 'curated';
}
export type ExperienceFinder = (input: { prompt: string; pool: ExperiencePool }) => Promise<FindResult>;

export interface EssayReview {
  strengths: string[];
  improvements: string[];
  authenticity: string;
  wordCount: number;
  onTarget: boolean | null;
  /** Hard guarantee surfaced to the UI: this path gives feedback, never a rewrite. */
  rewrote: false;
  source: 'ai' | 'curated';
}
export type EssayReviewer = (input: {
  prompt: string;
  content: string;
  targetWords?: number;
}) => Promise<EssayReview>;

export interface RecommenderBrief {
  /** A short paragraph the student can hand a recommender to jog their memory. */
  summary: string;
  talkingPoints: string[];
  suggestedStories: string[];
  /** Always false-by-construction: grounded only in family-visible experiences. */
  includesPrivate: false;
  source: 'ai' | 'curated';
}
export type RecommenderBriefer = (input: {
  slot: string;
  contactName?: string;
  relationship?: string;
  focus?: string;
  pool: ExperiencePool;
}) => Promise<RecommenderBrief>;

// ---- Bedrock plumbing -----------------------------------------------------

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
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    ),
  });
  const res = await client.send(command);
  if (!res.body) throw new Error('empty Bedrock response');
  const decoded = JSON.parse(new TextDecoder().decode(res.body)) as { content?: Array<{ text?: string }> };
  return (decoded.content ?? []).map((c) => (typeof c?.text === 'string' ? c.text : '')).join('\n');
}

export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '');
  const o = t.indexOf('{');
  const a = t.indexOf('[');
  const start = a === -1 ? o : o === -1 ? a : Math.min(o, a);
  if (start === -1) throw new Error('no JSON in model output');
  const close = t[start] === '[' ? ']' : '}';
  const end = t.lastIndexOf(close);
  if (end <= start) throw new Error('unterminated JSON');
  return JSON.parse(t.slice(start, end + 1));
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export const wordCountOf = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

// ---- Curated fallbacks ----------------------------------------------------

export const curatedExperienceFinder: ExperienceFinder = async ({ pool }) => {
  const suggestedExperiences = pool.experiences.slice(0, 5).map((e) => ({
    title: e.title,
    kind: e.kind,
    why: e.detail ? `Concrete detail to draw on: ${e.detail}` : 'A specific, personal moment you can build a story around.',
  }));
  const angles = [
    'Open with a specific scene, not a thesis — let the moment carry the “why”.',
    'Tie one concrete experience to a value (compassion, advocacy, resilience).',
    'End on growth: what it changed about how you see your intended path.',
  ];
  return { suggestedExperiences, angles, source: 'curated' };
};

export const curatedEssayReviewer: EssayReviewer = async ({ content, targetWords }) => {
  const wc = wordCountOf(content);
  const strengths: string[] = [];
  const improvements: string[] = [];
  if (wc >= 150) strengths.push('You have enough material to develop a real narrative.');
  else improvements.push('It’s short — develop one moment with sensory, specific detail.');
  if (/I learned|I realized|taught me|changed/i.test(content)) strengths.push('Good — you reflect on growth, not just events.');
  else improvements.push('Add a line of reflection: what did this change about you?');
  if (/\bvery\b|\breally\b|\bpassionate\b/i.test(content)) improvements.push('Trim generic intensifiers (“very”, “really”, “passionate”) — show it instead.');
  improvements.push('Make sure it reads like you, not an admissions template.');

  const onTarget = targetWords ? Math.abs(wc - targetWords) <= Math.max(25, targetWords * 0.1) : null;
  if (targetWords && !onTarget) improvements.push(`Word count ${wc} vs target ${targetWords} — ${wc > targetWords ? 'tighten' : 'expand'}.`);

  return {
    strengths,
    improvements,
    authenticity: 'Strongest essays sound like a specific person. Keep your real voice and concrete details.',
    wordCount: wc,
    onTarget,
    rewrote: false,
    source: 'curated',
  };
};

const SLOT_LABELS: Record<string, string> = {
  'stem-teacher': 'a STEM teacher',
  'humanities-teacher': 'a humanities teacher',
  'clinical-supervisor': 'a work or volunteer supervisor',
  'community-leader': 'a community leader',
  other: 'a recommender',
};

export const curatedRecommenderBrief: RecommenderBriefer = async ({ slot, contactName, relationship, pool }) => {
  const who = contactName ? contactName : SLOT_LABELS[slot] ?? 'your recommender';
  const top = pool.experiences.slice(0, 4);
  const talkingPoints = [
    'The student is applying to their intended college programs and would value a letter that speaks to their readiness.',
    relationship ? `Your relationship: ${relationship}.` : 'Speak to what you have personally seen of their work and character.',
    'Helpful themes: compassion, reliability, intellectual curiosity, and growth over time.',
  ];
  const suggestedStories = top.length
    ? top.map((e) => `${e.title}${e.detail ? ` — ${e.detail}` : ''}`)
    : ['Add some logged activities or experience hours and they will appear here as concrete stories to mention.'];
  return {
    summary: `A brief for ${who}: the student is pursuing their intended college program. This note collects concrete, family-shareable experiences they can reference in a recommendation.`,
    talkingPoints,
    suggestedStories,
    includesPrivate: false,
    source: 'curated',
  };
};

// ---- Bedrock-backed (with curated fallback) -------------------------------

function buildFindPrompt(input: { prompt: string; pool: ExperiencePool }): string {
  return [
    'You are a college-essay brainstorming partner for a college applicant. Given the prompt and the',
    "applicant's REAL logged experiences, suggest which experiences to write about and a few angles.",
    'Respond with ONLY JSON (no prose/fences): {"suggestedExperiences": [{"title": string,',
    '"kind": "activity"|"experience"|"motivation", "why": string}], "angles": string[]}.',
    `Prompt: ${input.prompt || '(general personal statement)'}`,
    `Experiences:\n${poolToText(input.pool)}`,
  ].join('\n');
}

export function makeBedrockExperienceFinder(options: AiOptions = {}, fallback: ExperienceFinder = curatedExperienceFinder): ExperienceFinder {
  return async (input) => {
    try {
      const raw = extractJson(await invokeText(buildFindPrompt(input), options)) as Record<string, unknown>;
      const list = Array.isArray(raw.suggestedExperiences) ? raw.suggestedExperiences : [];
      const suggestedExperiences = list
        .map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          const title = typeof o.title === 'string' ? o.title : '';
          const why = typeof o.why === 'string' ? o.why : '';
          const kind = o.kind === 'activity' || o.kind === 'experience' || o.kind === 'motivation' ? o.kind : 'activity';
          return title ? { title, kind, why } : null;
        })
        .filter((s): s is ExperienceSuggestion => s !== null);
      const angles = strArr(raw.angles);
      if (suggestedExperiences.length === 0 && angles.length === 0) return fallback(input);
      return { suggestedExperiences, angles, source: 'ai' };
    } catch {
      return fallback(input);
    }
  };
}

function buildReviewPrompt(input: { prompt: string; content: string; targetWords?: number }): string {
  return [
    'You are an honest, supportive college-essay coach. Give FEEDBACK ONLY — never rewrite or draft',
    'the essay for the student. Respond with ONLY JSON (no prose/fences): {"strengths": string[],',
    '"improvements": string[], "authenticity": string}.',
    `Prompt: ${input.prompt || '(general)'}`,
    input.targetWords ? `Target words: ${input.targetWords}.` : '',
    `Essay draft:\n${input.content}`,
  ].join('\n');
}

export function makeBedrockEssayReviewer(options: AiOptions = {}, fallback: EssayReviewer = curatedEssayReviewer): EssayReviewer {
  return async (input) => {
    try {
      const raw = extractJson(await invokeText(buildReviewPrompt(input), options)) as Record<string, unknown>;
      const strengths = strArr(raw.strengths);
      const improvements = strArr(raw.improvements);
      if (strengths.length === 0 && improvements.length === 0) return fallback(input);
      const wc = wordCountOf(input.content);
      return {
        strengths,
        improvements,
        authenticity: typeof raw.authenticity === 'string' ? raw.authenticity : '',
        wordCount: wc,
        onTarget: input.targetWords ? Math.abs(wc - input.targetWords) <= Math.max(25, input.targetWords * 0.1) : null,
        rewrote: false,
        source: 'ai',
      };
    } catch {
      return fallback(input);
    }
  };
}

function buildBriefPrompt(input: { slot: string; contactName?: string; relationship?: string; focus?: string; pool: ExperiencePool }): string {
  return [
    'You help a college applicant prepare a brief to hand to a recommender writing a letter for',
    'them. Use ONLY the family-shareable experiences provided (never invent details). Respond with ONLY',
    'JSON (no prose/fences): {"summary": string, "talkingPoints": string[], "suggestedStories": string[]}.',
    `Recommender slot: ${input.slot}${input.contactName ? ` (${input.contactName})` : ''}.`,
    input.relationship ? `Relationship strength: ${input.relationship}.` : '',
    input.focus ? `Focus the brief on: ${input.focus}.` : '',
    `Family-shareable experiences:\n${poolToText(input.pool)}`,
  ].join('\n');
}

export function makeBedrockRecommenderBrief(options: AiOptions = {}, fallback: RecommenderBriefer = curatedRecommenderBrief): RecommenderBriefer {
  return async (input) => {
    try {
      const raw = extractJson(await invokeText(buildBriefPrompt(input), options)) as Record<string, unknown>;
      const summary = typeof raw.summary === 'string' ? raw.summary : '';
      const talkingPoints = strArr(raw.talkingPoints);
      const suggestedStories = strArr(raw.suggestedStories);
      if (!summary && talkingPoints.length === 0 && suggestedStories.length === 0) return fallback(input);
      return { summary, talkingPoints, suggestedStories, includesPrivate: false, source: 'ai' };
    } catch {
      return fallback(input);
    }
  };
}
