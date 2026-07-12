// AI essay coach for Application Central. Bedrock-backed behind an injectable seam with
// deterministic curated fallback (model id from BEDROCK_MODEL_ID, never hardcoded):
//   • findExperiences     — surface the logged experiences + angles most relevant to a prompt.
//   • reviewEssay         — feedback + rubric rating on a draft. NEVER rewrites the essay.
//   • practiceQuestions   — sample application questions in the target college's style.
// The coach contract: suggest, question, critique — never write, rewrite, or supply essay
// sentences. Experience inputs arrive already privacy-filtered (grounding.ts), so this layer
// can't leak private entries. The full review (whose improvements may reference private-derived
// experiences) is persisted on the creator-guarded EssayReviewJob — a later cross-caller read is
// blocked by that guard, not by non-persistence. The compact essay.lastReview stays scores-only
// (overall/verdict/wordCount), derived solely from the draft text.

import { majorPhrase } from '../../shared/ai/major.js';
import { invokeMessages, type BedrockSend } from '../../shared/metering/index.js';
import { packFocusBriefs } from '../../shared/packs/index.js';
import { collegeToText, poolToText, type CollegeContext, type Experience, type ExperiencePool } from './grounding.js';

/** Major-specific guidance line for a prompt — empty when no major or no matching pack. */
function majorGuidanceLine(majors: string[] = []): string {
  const guidance = packFocusBriefs(majors);
  return guidance.length ? `Major-specific guidance: ${guidance.join(' ')}` : '';
}

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
export type ExperienceFinder = (input: {
  prompt: string;
  pool: ExperiencePool;
  majors?: string[];
  college?: CollegeContext;
}) => Promise<FindResult>;

export const REVIEW_VERDICTS = ['ready', 'close', 'keep-working'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

/** 1-10 rubric scores. collegeFit only when the essay is linked to a college. */
export interface ReviewRatings {
  promptFit: number;
  voice: number;
  structure: number;
  specificity: number;
  collegeFit?: number;
}

export interface EssayReview {
  strengths: string[];
  improvements: string[];
  authenticity: string;
  /** Rubric rating — present only on the real AI path; the curated fallback never fakes scores. */
  ratings?: ReviewRatings;
  overall?: number;
  verdict?: ReviewVerdict;
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
  college?: CollegeContext;
  /** The caller's privacy-filtered logged experiences, so the review can name what the essay
   *  omits/underuses. Already filtered by role in grounding.ts — this layer can't leak private entries. */
  pool?: ExperiencePool;
}) => Promise<EssayReview>;

export interface PracticeQuestion {
  question: string;
  why: string;
  tip: string;
}
export interface PracticeQuestionSet {
  questions: PracticeQuestion[];
  source: 'ai' | 'curated';
}
export type PracticeQuestionGenerator = (input: {
  college?: CollegeContext;
  majors?: string[];
  count?: number;
}) => Promise<PracticeQuestionSet>;

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
  majors?: string[];
}) => Promise<RecommenderBrief>;

// ---- Bedrock plumbing -----------------------------------------------------

async function invokeText(prompt: string, options: AiOptions): Promise<string> {
  // Funnels through the metered `invokeMessages` seam so token usage is attributed to the
  // family + `application-central`. Output feeds extractJson, so the block-join separator is
  // immaterial (invokeMessages joins with '').
  return invokeMessages({
    feature: 'application-central',
    prompt,
    maxTokens: 1500,
    modelId: options.modelId,
    client: options.client as BedrockSend | undefined,
  });
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

export function buildFindPrompt(input: { prompt: string; pool: ExperiencePool; majors?: string[]; college?: CollegeContext }): string {
  const applicant = `a college applicant pursuing ${majorPhrase(input.majors, 'their intended college program')}`;
  return [
    `You are a college-essay brainstorming partner for ${applicant}. Given the prompt and the`,
    "applicant's REAL logged experiences, suggest which experiences to write about and a few angles.",
    'You are a coach, not a writer: suggest and explain — never draft sentences for the essay.',
    majorGuidanceLine(input.majors),
    input.college ? `${collegeToText(input.college)}\nFavor experiences and angles that speak to what this school values.` : '',
    'Respond with ONLY JSON (no prose/fences): {"suggestedExperiences": [{"title": string,',
    '"kind": "activity"|"experience"|"motivation", "why": string}], "angles": string[]}.',
    `Prompt: ${input.prompt || '(general personal statement)'}`,
    `Experiences:\n${poolToText(input.pool)}`,
  ]
    .filter(Boolean)
    .join('\n');
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

export function buildReviewPrompt(input: { prompt: string; content: string; targetWords?: number; college?: CollegeContext; pool?: ExperiencePool }): string {
  return [
    'You are an honest, supportive college-essay coach reviewing a draft. Give FEEDBACK ONLY —',
    'never rewrite the essay, never draft replacement sentences or paragraphs for the student.',
    'Also rate the draft on a 1-10 rubric (10 = ready to submit to a selective program):',
    '  promptFit — does it actually answer the prompt?',
    '  voice — does it sound like a real, specific person (not an admissions template)?',
    '  structure — does it open in a scene, build, and land on growth?',
    '  specificity — concrete detail over generic claims?',
    input.college ? '  collegeFit — does it connect to what this specific school values?' : '',
    'And give an overall 1-10 plus a verdict: "ready" (submit-worthy), "close" (one more pass),',
    'or "keep-working". Be honest — a first draft is rarely above 6.',
    'Respond with ONLY JSON (no prose/fences): {"strengths": string[], "improvements": string[],',
    '"authenticity": string, "ratings": {"promptFit": number, "voice": number, "structure": number,',
    `"specificity": number${input.college ? ', "collegeFit": number' : ''}}, "overall": number, "verdict": "ready"|"close"|"keep-working"}.`,
    input.college ? collegeToText(input.college) : '',
    `Prompt: ${input.prompt || '(general)'}`,
    input.targetWords ? `Target words: ${input.targetWords}.` : '',
    input.pool && input.pool.experiences.length
      ? `The student's REAL logged experiences (use ONLY these; never invent details):\n${poolToText(input.pool)}\nIn "improvements", name specific logged experiences the essay omits or underuses, or where it stays generic instead of drawing on this real material. Reference experiences by their title.`
      : '',
    `Essay draft:\n${input.content}`,
  ]
    .filter(Boolean)
    .join('\n');
}

const score = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 10 ? Math.round(n) : undefined;
};

export function parseRatings(raw: unknown, expectCollegeFit: boolean): ReviewRatings | undefined {
  const o = (raw ?? {}) as Record<string, unknown>;
  const promptFit = score(o.promptFit);
  const voice = score(o.voice);
  const structure = score(o.structure);
  const specificity = score(o.specificity);
  if (promptFit === undefined || voice === undefined || structure === undefined || specificity === undefined) return undefined;
  const collegeFit = expectCollegeFit ? score(o.collegeFit) : undefined;
  return { promptFit, voice, structure, specificity, ...(collegeFit !== undefined ? { collegeFit } : {}) };
}

export function makeBedrockEssayReviewer(options: AiOptions = {}, fallback: EssayReviewer = curatedEssayReviewer): EssayReviewer {
  return async (input) => {
    try {
      const raw = extractJson(await invokeText(buildReviewPrompt(input), options)) as Record<string, unknown>;
      const strengths = strArr(raw.strengths);
      const improvements = strArr(raw.improvements);
      if (strengths.length === 0 && improvements.length === 0) return fallback(input);
      const wc = wordCountOf(input.content);
      const ratings = parseRatings(raw.ratings, input.college !== undefined);
      const overall = score(raw.overall);
      const verdict = REVIEW_VERDICTS.includes(raw.verdict as ReviewVerdict) ? (raw.verdict as ReviewVerdict) : undefined;
      return {
        strengths,
        improvements,
        authenticity: typeof raw.authenticity === 'string' ? raw.authenticity : '',
        ...(ratings ? { ratings } : {}),
        ...(overall !== undefined ? { overall } : {}),
        ...(verdict ? { verdict } : {}),
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

// ---- Practice questions ---------------------------------------------------

export const curatedPracticeQuestions: PracticeQuestionGenerator = async ({ college, count = 5 }) => {
  const base: PracticeQuestion[] = [
    {
      question: 'Describe a moment that made you certain about your intended path. What did it change?',
      why: 'The core "why us / why this field" question nearly every application asks in some form.',
      tip: 'Pick one specific moment and stay in the scene — resist summarizing your whole journey.',
    },
    {
      question: 'Tell us about a time you faced a setback. How did you respond, and what did you learn?',
      why: 'Schools want evidence of resilience and honest self-reflection.',
      tip: 'The setback matters less than what you did next — spend most words on the response.',
    },
    {
      question: 'Describe a community you belong to and your role within it.',
      why: 'A Common App staple — reveals values and how you show up for others.',
      tip: 'Define "community" narrowly (a shift crew, a study group) — small and vivid beats big and vague.',
    },
    {
      question: 'What experience with someone different from you changed how you see the world?',
      why: 'Tests empathy and perspective-taking — central to service-oriented programs.',
      tip: 'Show the shift: what you assumed before, the moment it cracked, what you believe now.',
    },
    {
      question: 'Why this school specifically — what would you contribute here that someone else would not?',
      why: 'The "why us" supplemental. Generic answers are the most common reason essays fall flat.',
      tip: 'Name specific programs, values, or people at the school and tie each to a real experience.',
    },
  ];
  const questions = college?.essayPrompts?.length
    ? [
        ...college.essayPrompts.slice(0, 2).map((p) => ({
          question: p,
          why: `A real ${college.name} prompt — practice on the actual question.`,
          tip: 'Draft an outline first: scene, stakes, turn, growth.',
        })),
        ...base,
      ].slice(0, count)
    : base.slice(0, count);
  return { questions, source: 'curated' };
};

export function buildPracticePrompt(input: { college?: CollegeContext; majors?: string[]; count: number }): string {
  const applicant = `a college applicant pursuing ${majorPhrase(input.majors, 'their intended college program')}`;
  return [
    `You create realistic practice application questions for ${applicant}.`,
    input.college
      ? `${collegeToText(input.college)}\nWrite questions in THIS school's authentic style — echo its real prompts and what its admissions process emphasizes.`
      : 'No target school given — write Common-App-style personal statement and supplemental questions.',
    majorGuidanceLine(input.majors),
    `Generate exactly ${input.count} questions. For each: "why" = what admissions is really probing for,`,
    '"tip" = one concrete coaching tip for approaching it (never sample essay text).',
    'Respond with ONLY JSON (no prose/fences): {"questions": [{"question": string, "why": string, "tip": string}]}.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function makeBedrockPracticeQuestions(
  options: AiOptions = {},
  fallback: PracticeQuestionGenerator = curatedPracticeQuestions,
): PracticeQuestionGenerator {
  return async (input) => {
    const count = Math.min(Math.max(input.count ?? 5, 3), 8);
    try {
      const raw = extractJson(await invokeText(buildPracticePrompt({ ...input, count }), options)) as Record<string, unknown>;
      const list = Array.isArray(raw.questions) ? raw.questions : [];
      const questions = list
        .map((q) => {
          const o = (q ?? {}) as Record<string, unknown>;
          const question = typeof o.question === 'string' ? o.question : '';
          const why = typeof o.why === 'string' ? o.why : '';
          const tip = typeof o.tip === 'string' ? o.tip : '';
          return question ? { question, why, tip } : null;
        })
        .filter((q): q is PracticeQuestion => q !== null)
        .slice(0, count);
      if (questions.length === 0) return fallback({ ...input, count });
      return { questions, source: 'ai' };
    } catch {
      return fallback({ ...input, count });
    }
  };
}

export function buildBriefPrompt(input: { slot: string; contactName?: string; relationship?: string; focus?: string; pool: ExperiencePool; majors?: string[] }): string {
  const applicant = `a college applicant pursuing ${majorPhrase(input.majors, 'their intended college program')}`;
  return [
    `You help ${applicant} prepare a brief to hand to a recommender writing a letter for`,
    'them. Use ONLY the family-shareable experiences provided (never invent details). Respond with ONLY',
    'JSON (no prose/fences): {"summary": string, "talkingPoints": string[], "suggestedStories": string[]}.',
    majorGuidanceLine(input.majors),
    `Recommender slot: ${input.slot}${input.contactName ? ` (${input.contactName})` : ''}.`,
    input.relationship ? `Relationship strength: ${input.relationship}.` : '',
    input.focus ? `Focus the brief on: ${input.focus}.` : '',
    `Family-shareable experiences:\n${poolToText(input.pool)}`,
  ]
    .filter(Boolean)
    .join('\n');
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
