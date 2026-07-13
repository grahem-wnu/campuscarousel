// Visit prep for POST /colleges/:id/visits/:vid/prep.
//
// The spec calls for Bedrock + web search (best time, program-specific questions, logistics, contact
// info). The generation sits behind an injectable `PrepGenerator` seam with two implementations:
//   • makeBedrockPrep — calls Bedrock (model/inference-profile from BEDROCK_MODEL_ID, never
//     hardcoded; lazy SDK import; injectable client) for the "best time" guidance + any extra
//     questions, layering them on top of the curated baseline. Falls back to curated on any error.
//   • curatedPrep     — deterministic: the spec's program question checklist + logistics
//     pulled from the college's own contact info. No network/clock — safe in tests and as the
//     graceful fallback (and the default the handlers use when nothing is injected).
//
// Mirrors backend/modules/certifications/suggester.ts (the house pattern for an AI feature).

import { majorPhrase } from '../../shared/ai/major.js';
import { invokeMessages, type BedrockSend } from '../../shared/metering/index.js';
import { packFocusBriefs } from '../../shared/packs/index.js';
import type { College, Visit } from '../../shared/data/index.js';

export interface VisitLogistics {
  address?: string;
  parking?: string;
  contact?: string;
  campusVisitUrl?: string;
}

export interface VisitPrep {
  /** Guidance on the best time to visit (open-house windows, term timing). */
  bestTime: string;
  /** Program-specific questions to ask, pre-populated from the spec's checklist. */
  questions: string[];
  logistics: VisitLogistics;
  source: 'ai' | 'curated';
}

export interface PrepInput {
  college: College;
  visit: Visit;
  /** The active student's intended major(s) — names the academic focus + folds in pack guidance. */
  majors?: string[];
}

export type PrepGenerator = (input: PrepInput) => Promise<VisitPrep>;

/**
 * The program question checklist from the spec. These are the questions schools notice an
 * informed applicant asking. Deterministic — the backbone of every prep, AI or curated.
 */
export const PROGRAM_QUESTIONS: readonly string[] = [
  'What support services (academic, wellness, advising) are available to students?',
  'What are typical class sizes, and what is the faculty-to-student ratio?',
  'What hands-on, experiential, or research opportunities exist in this program?',
  'Is admission direct (guaranteed) or competitive/secondary for this program?',
  'What internships, co-ops, or placement partnerships does the program offer?',
  'What does a typical first-year schedule look like in this program?',
  'Are there study-abroad or honors options tied to this program?',
  'What outcomes (graduation, employment, further study) do students typically see?',
];

const has = (s?: string): s is string => typeof s === 'string' && s.trim().length > 0;

/** Build the logistics block from the college's own stored contact info / location. */
export function logisticsFor(college: College): VisitLogistics {
  const contact =
    college.contactInfo?.programAdmissionsEmail ??
    college.contactInfo?.programAdmissionsPhone ??
    college.contactInfo?.financialAidPhone;
  return {
    address: has(college.location) ? college.location : undefined,
    parking: undefined,
    contact: has(contact) ? contact : undefined,
    campusVisitUrl: has(college.contactInfo?.campusVisitUrl) ? college.contactInfo!.campusVisitUrl : undefined,
  };
}

/** Default "best time" guidance keyed off the visit type — no network, no clock. */
function curatedBestTime(visit: Visit): string {
  switch (visit.visitType) {
    case 'open-house':
      return 'Aim for an official open-house or admitted-student day — check the campus-visit page for fall/spring dates.';
    case 'overnight':
      return 'Schedule an overnight while classes are in session (avoid breaks) so you see real campus and dorm life.';
    case 'virtual':
      return 'Book a virtual info session; ask for a recording if the live time does not work.';
    default:
      return 'Visit while classes are in session (not during breaks or finals) so the department and its facilities are active.';
  }
}

/**
 * Deterministic curated prep: the full program-question checklist + logistics from the college's
 * contact info. Safe in tests and as the production fallback.
 */
export const curatedPrep: PrepGenerator = async ({ college, visit }) => ({
  bestTime: curatedBestTime(visit),
  questions: [...PROGRAM_QUESTIONS],
  logistics: logisticsFor(college),
  source: 'curated',
});

// ---------------------------------------------------------------------------
// Bedrock-backed prep (production). Lazy SDK import; model id from BEDROCK_MODEL_ID. Any
// error/timeout/empty parse falls back to curated, so /prep is always useful.
// ---------------------------------------------------------------------------

/** Minimal structural type of the Bedrock client we use (just `send`) — keeps tests injectable. */
export interface BedrockInvoker {
  send(command: unknown): Promise<{ body?: Uint8Array }>;
}

export interface BedrockPrepOptions {
  modelId?: string;
  client?: BedrockInvoker;
  fallback?: PrepGenerator;
}

/** Prompt asking the model for best-time guidance + a few college-specific questions as JSON. With
 *  `majors` set, the prep targets that academic focus and folds in any major-pack guidance. */
function buildPrompt(college: College, visit: Visit, majors: string[] = []): string {
  const guidance = packFocusBriefs(majors);
  const focusLine = guidance.length ? ` Major-specific guidance: ${guidance.join(' ')}` : '';
  return [
    `A prospective college applicant pursuing ${majorPhrase(majors, 'their intended college program')} is planning a ${visit.visitType ?? 'campus'} visit to ${college.name}`,
    college.location ? ` (${college.location})` : '',
    ` on ${visit.date}.`,
    focusLine,
    ' Give concise, program-focused visit prep. Respond with ONLY a JSON object (no prose, no code fences):',
    '{"bestTime": string (one or two sentences on the best time/season to visit this school),',
    '"extraQuestions": string[] (up to 5 school-specific program questions beyond the standard checklist)}.',
  ].join('');
}

function parsePrep(text: string): { bestTime?: string; extraQuestions: string[] } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model output');
  const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const extra = Array.isArray(obj.extraQuestions)
    ? obj.extraQuestions.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, 5)
    : [];
  return { bestTime: typeof obj.bestTime === 'string' ? obj.bestTime.trim() : undefined, extraQuestions: extra };
}

/**
 * Production prep: enrich the curated baseline with model-generated best-time guidance and a few
 * school-specific questions. Gracefully falls back to curated on any problem. Never throws.
 */
export function makeBedrockPrep(options: BedrockPrepOptions = {}): PrepGenerator {
  const fallback = options.fallback ?? curatedPrep;
  return async ({ college, visit, majors }) => {
    const modelId = options.modelId ?? process.env.BEDROCK_MODEL_ID;
    if (!modelId) return fallback({ college, visit, majors });
    try {
      // Funnels through the metered `invokeMessages` seam so token usage is attributed to the
      // family + `visit-planner`.
      const text = await invokeMessages({
        feature: 'visit-planner',
        prompt: buildPrompt(college, visit, majors),
        maxTokens: 800,
        modelId,
        client: options.client as BedrockSend | undefined,
      });
      const { bestTime, extraQuestions } = parsePrep(text);
      const base = await curatedPrep({ college, visit });
      return {
        bestTime: bestTime && bestTime.length > 0 ? bestTime : base.bestTime,
        questions: [...base.questions, ...extraQuestions],
        logistics: base.logistics,
        source: 'ai',
      };
    } catch {
      return fallback({ college, visit, majors });
    }
  };
}
