// AI layer for Exam Prep: study-plan + analyze. Both go through Bedrock (model/inference-profile
// from BEDROCK_MODEL_ID env, never hardcoded) behind an injectable seam, and degrade gracefully to a
// deterministic CURATED result on any error/timeout/malformed output — so the endpoints always
// return something useful (mirrors the merged certifications module). The spec notes no web search is
// needed here (general knowledge keyed to weak areas + exam date + target requirements).

import { majorPhrase } from '../../shared/ai/major.js';
import { invokeMessages, type BedrockSend } from '../../shared/metering/index.js';
import { packFocusBriefs } from '../../shared/packs/index.js';
import { SECTION_LABEL, type ProgressSummary, type Section } from './progress.js';

/** Name the exam (e.g. "TEAS") when the pack supplies one, else a neutral phrase. */
const examLabel = (examName?: string): string => (examName && examName.trim() ? examName : 'the entrance/standardized exam');

/** Major-specific guidance line for a prompt — empty when no major or no matching pack. */
function majorGuidanceLine(majors: string[] = []): string {
  const guidance = packFocusBriefs(majors);
  return guidance.length ? `Major-specific guidance: ${guidance.join(' ')}` : '';
}

/** Minimal structural type of the Bedrock client (just `send`) — keeps tests injectable. */
export interface BedrockInvoker {
  send(command: unknown): Promise<{ body?: Uint8Array }>;
}
export interface AiOptions {
  modelId?: string;
  client?: BedrockInvoker;
}

// ---- Study plan -----------------------------------------------------------

export interface PlanInput {
  weeksUntilExam: number | null;
  examDate?: string;
  targetScore: number;
  targetSchools?: string[];
  hoursPerWeek: number;
  weakSections: string[];
  latestOverall: number | null;
  /** The exam this plan is for (e.g. "TEAS" from the nursing pack); omitted → neutral phrasing. */
  examName?: string;
  /** The active student's intended major(s) — names the academic focus + folds in pack guidance. */
  majors?: string[];
}
export interface StudyWeek {
  week: number;
  focus: string[];
  hours: number;
  practice: string;
}
export interface StudyPlan {
  summary: string;
  focusAreas: string[];
  weeks: StudyWeek[];
  source: 'ai' | 'curated';
}
export type Planner = (input: PlanInput) => Promise<StudyPlan>;

// ---- Analysis -------------------------------------------------------------

export interface AnalyzeContext {
  summary: ProgressSummary;
  targetScore: number;
  examDate?: string;
  /** The exam being analyzed (e.g. "TEAS"); omitted → neutral phrasing. */
  examName?: string;
  /** The active student's intended major(s) — names the academic focus + folds in pack guidance. */
  majors?: string[];
}
export interface Analysis {
  summary: string;
  recommendations: string[];
  readiness: string;
  source: 'ai' | 'curated';
}
export type Analyzer = (ctx: AnalyzeContext) => Promise<Analysis>;

// ---- Bedrock plumbing -----------------------------------------------------

async function invokeText(prompt: string, options: AiOptions): Promise<string> {
  // Funnels through the metered `invokeMessages` seam so token usage is attributed to the
  // family + `exam-prep`. Output feeds extractJson, so the block-join separator is immaterial
  // (invokeMessages joins with '').
  return invokeMessages({
    feature: 'exam-prep',
    prompt,
    maxTokens: 1500,
    modelId: options.modelId,
    client: options.client as BedrockSend | undefined,
  });
}

/** Extract the first JSON object/array from model text, tolerating prose / code fences. */
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

// ---- Curated (deterministic) fallbacks ------------------------------------

const clampWeeks = (n: number | null): number => Math.max(1, Math.min(12, n ?? 6));

/** Default focus rotation when no weak sections are known yet — cover all four sections. */
const ALL_SECTIONS: Section[] = ['science', 'math', 'reading', 'englishLanguageUsage'];

export const curatedPlanner: Planner = async (input) => {
  const total = clampWeeks(input.weeksUntilExam);
  const focusPool = input.weakSections.length
    ? input.weakSections
    : ALL_SECTIONS.map((s) => SECTION_LABEL[s]);
  const weeks: StudyWeek[] = Array.from({ length: total }, (_, i) => {
    const focus = [focusPool[i % focusPool.length]!];
    if (focusPool.length > 1) focus.push(focusPool[(i + 1) % focusPool.length]!);
    return {
      week: i + 1,
      focus,
      hours: input.hoursPerWeek,
      // Ramp practice tests toward the exam.
      practice: i >= total - 2 ? '1 full timed practice test + review misses' : 'Section drills + flashcards',
    };
  });
  const summary =
    `A ${total}-week plan at ~${input.hoursPerWeek}h/week toward a ${input.targetScore} overall, ` +
    (input.weakSections.length ? `prioritizing ${input.weakSections.join(', ')}.` : 'building all four sections evenly.');
  return { summary, focusAreas: focusPool, weeks, source: 'curated' };
};

export const curatedAnalyzer: Analyzer = async ({ summary, targetScore }) => {
  const recs: string[] = [];
  for (const s of summary.weakSections) recs.push(`Add focused drills on ${SECTION_LABEL[s]} — it's your lowest section.`);
  if (summary.trend !== null && summary.trend > 0) recs.push(`Scores are trending up (+${summary.trend}); keep the current routine.`);
  if (summary.trend !== null && summary.trend < 0) recs.push('Recent dip — review test conditions (timing, fatigue) and redo missed questions.');
  if (summary.cumulativeStudyHours < 20) recs.push('Log more study sessions — consistent weekly hours move exam scores the most.');
  if (recs.length === 0) recs.push('Solid across the board — take a full timed practice test to confirm endurance.');

  const latest = summary.latestOverall;
  const readiness =
    latest === null
      ? 'No scored attempts yet — take a baseline practice test.'
      : latest >= targetScore
        ? `At ${latest}, you're at/above your ${targetScore} target.`
        : `At ${latest}, about ${Math.round((targetScore - latest) * 10) / 10} points under your ${targetScore} target.`;

  const trendWord = summary.trend === null ? 'not enough attempts to trend yet' : summary.trend >= 0 ? 'improving' : 'slipping';
  return {
    summary: `Across ${summary.attempts} scored attempt(s), best ${summary.bestOverall ?? '—'}, ${trendWord}.`,
    recommendations: recs,
    readiness,
    source: 'curated',
  };
};

// ---- Bedrock-backed (with curated fallback) -------------------------------

export function buildPlanPrompt(input: PlanInput): string {
  return [
    `You are a coach for ${examLabel(input.examName)}, the entrance exam for a student pursuing ${majorPhrase(input.majors, 'their intended college program')}.`,
    'Build a weekly study plan as STRICT JSON only',
    '(no prose/fences):',
    '{"summary": string, "focusAreas": string[], "weeks": [{"week": number, "focus": string[],',
    '"hours": number, "practice": string}]}.',
    majorGuidanceLine(input.majors),
    `Target overall score: ${input.targetScore}.`,
    input.examDate ? `Exam date: ${input.examDate} (~${input.weeksUntilExam ?? '?'} weeks out).` : 'No exam date set.',
    `Study budget: ~${input.hoursPerWeek} hours/week.`,
    input.latestOverall !== null ? `Latest practice overall: ${input.latestOverall}.` : 'No practice scores yet.',
    input.weakSections.length ? `Weakest sections: ${input.weakSections.join(', ')}.` : 'No weak sections identified yet.',
    input.targetSchools?.length ? `Target schools: ${input.targetSchools.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function makeBedrockPlanner(options: AiOptions = {}, fallback: Planner = curatedPlanner): Planner {
  return async (input) => {
    try {
      const raw = extractJson(await invokeText(buildPlanPrompt(input), options)) as Record<string, unknown>;
      const weeksRaw = Array.isArray(raw.weeks) ? raw.weeks : [];
      const weeks: StudyWeek[] = weeksRaw
        .map((w, i) => {
          const o = (w ?? {}) as Record<string, unknown>;
          const focus = Array.isArray(o.focus) ? o.focus.filter((x): x is string => typeof x === 'string') : [];
          if (focus.length === 0) return null;
          return {
            week: typeof o.week === 'number' ? o.week : i + 1,
            focus,
            hours: typeof o.hours === 'number' ? o.hours : input.hoursPerWeek,
            practice: typeof o.practice === 'string' ? o.practice : '',
          };
        })
        .filter((w): w is StudyWeek => w !== null);
      if (weeks.length === 0) return fallback(input);
      return {
        summary: typeof raw.summary === 'string' ? raw.summary : '',
        focusAreas: Array.isArray(raw.focusAreas) ? raw.focusAreas.filter((x): x is string => typeof x === 'string') : input.weakSections,
        weeks,
        source: 'ai',
      };
    } catch {
      return fallback(input);
    }
  };
}

export function buildAnalyzePrompt(ctx: AnalyzeContext): string {
  return [
    `You are a coach for ${examLabel(ctx.examName)}, the entrance exam for a student pursuing ${majorPhrase(ctx.majors, 'their intended college program')}.`,
    'Given this progress summary, respond with STRICT JSON only',
    '(no prose/fences): {"summary": string, "recommendations": string[], "readiness": string}.',
    majorGuidanceLine(ctx.majors),
    `Target overall: ${ctx.targetScore}.`,
    ctx.examDate ? `Exam date: ${ctx.examDate}.` : '',
    `Summary: ${JSON.stringify(ctx.summary)}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function makeBedrockAnalyzer(options: AiOptions = {}, fallback: Analyzer = curatedAnalyzer): Analyzer {
  return async (ctx) => {
    try {
      const raw = extractJson(await invokeText(buildAnalyzePrompt(ctx), options)) as Record<string, unknown>;
      const recommendations = Array.isArray(raw.recommendations)
        ? raw.recommendations.filter((x): x is string => typeof x === 'string')
        : [];
      if (typeof raw.summary !== 'string' || recommendations.length === 0) return fallback(ctx);
      return {
        summary: raw.summary,
        recommendations,
        readiness: typeof raw.readiness === 'string' ? raw.readiness : '',
        source: 'ai',
      };
    } catch {
      return fallback(ctx);
    }
  };
}
