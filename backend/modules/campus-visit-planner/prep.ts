// Visit prep for POST /colleges/:id/visits/:vid/prep.
//
// The spec calls for Bedrock + web search (best time, nursing-specific questions, logistics, contact
// info). The generation sits behind an injectable `PrepGenerator` seam with two implementations:
//   • makeBedrockPrep — calls Bedrock (model/inference-profile from BEDROCK_MODEL_ID, never
//     hardcoded; lazy SDK import; injectable client) for the "best time" guidance + any extra
//     questions, layering them on top of the curated baseline. Falls back to curated on any error.
//   • curatedPrep     — deterministic: the spec's nursing-specific question checklist + logistics
//     pulled from the college's own contact info. No network/clock — safe in tests and as the
//     graceful fallback (and the default the handlers use when nothing is injected).
//
// Mirrors backend/modules/certifications/suggester.ts (the house pattern for an AI feature).

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
  /** Nursing-specific questions to ask, pre-populated from the spec's checklist. */
  questions: string[];
  logistics: VisitLogistics;
  source: 'ai' | 'curated';
}

export interface PrepInput {
  college: College;
  visit: Visit;
}

export type PrepGenerator = (input: PrepInput) => Promise<VisitPrep>;

/**
 * The nursing-specific question checklist from the spec. These are the questions schools notice an
 * informed applicant asking. Deterministic — the backbone of every prep, AI or curated.
 */
export const NURSING_QUESTIONS: readonly string[] = [
  'Which hospitals and clinical sites do nursing students rotate through?',
  'What is the ICU / critical-care clinical placement rate for students?',
  'What is the most recent NCLEX-RN first-time pass rate?',
  'How many clinical hours does the program require, and when do they start?',
  'Is admission a direct-admit (guaranteed) BSN, or a secondary/competitive nursing application?',
  'What academic and wellness support services are available to nursing students?',
  'What are the faculty-to-student and clinical instructor-to-student ratios?',
  'Are there undergraduate research, simulation-lab, or study-abroad opportunities in nursing?',
];

const has = (s?: string): s is string => typeof s === 'string' && s.trim().length > 0;

/** Build the logistics block from the college's own stored contact info / location. */
export function logisticsFor(college: College): VisitLogistics {
  const contact =
    college.contactInfo?.nursingAdmissionsEmail ??
    college.contactInfo?.nursingAdmissionsPhone ??
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
      return 'Aim for an official nursing open-house or admitted-student day — check the campus-visit page for fall/spring dates.';
    case 'overnight':
      return 'Schedule an overnight while classes are in session (avoid breaks) so you see real campus and dorm life.';
    case 'virtual':
      return 'Book a virtual nursing info session; ask for a recording if the live time does not work.';
    default:
      return 'Visit while classes are in session (not during breaks or finals) so the nursing department and clinical facilities are active.';
  }
}

/**
 * Deterministic curated prep: the full nursing-question checklist + logistics from the college's
 * contact info. Safe in tests and as the production fallback.
 */
export const curatedPrep: PrepGenerator = async ({ college, visit }) => ({
  bestTime: curatedBestTime(visit),
  questions: [...NURSING_QUESTIONS],
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

/** Prompt asking the model for best-time guidance + a few college-specific questions as JSON. */
function buildPrompt(college: College, visit: Visit): string {
  return [
    `A prospective BSN nursing applicant is planning a ${visit.visitType ?? 'campus'} visit to ${college.name}`,
    college.location ? ` (${college.location})` : '',
    ` on ${visit.date}.`,
    'Give concise, nursing-focused visit prep. Respond with ONLY a JSON object (no prose, no code fences):',
    '{"bestTime": string (one or two sentences on the best time/season to visit this school),',
    '"extraQuestions": string[] (up to 5 school-specific nursing questions beyond the standard checklist)}.',
  ].join('');
}

function parsePrep(decoded: unknown): { bestTime?: string; extraQuestions: string[] } {
  const content = (decoded as { content?: Array<{ text?: string }> })?.content;
  const text = Array.isArray(content) ? content.map((c) => c?.text ?? '').join('\n') : '';
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
  return async ({ college, visit }) => {
    const modelId = options.modelId ?? process.env.BEDROCK_MODEL_ID;
    if (!modelId) return fallback({ college, visit });
    try {
      const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
      const client: BedrockInvoker = options.client ?? (new BedrockRuntimeClient({}) as unknown as BedrockInvoker);
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 800,
            messages: [{ role: 'user', content: buildPrompt(college, visit) }],
          }),
        ),
      });
      const res = await client.send(command);
      if (!res.body) return fallback({ college, visit });
      const decoded = JSON.parse(new TextDecoder().decode(res.body)) as unknown;
      const { bestTime, extraQuestions } = parsePrep(decoded);
      const base = await curatedPrep({ college, visit });
      return {
        bestTime: bestTime && bestTime.length > 0 ? bestTime : base.bestTime,
        questions: [...base.questions, ...extraQuestions],
        logistics: base.logistics,
        source: 'ai',
      };
    } catch {
      return fallback({ college, visit });
    }
  };
}
