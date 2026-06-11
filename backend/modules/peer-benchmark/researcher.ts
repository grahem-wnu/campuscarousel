// AI research for the benchmark refresh + gaps analysis.
//
// The Bedrock call is injected (the `BenchmarkResearcher` interface) exactly like the data client —
// so the handlers and their tests never reach for AWS, and the live binding is swapped in by the
// route manifest. The prompt builders and the model-output parsers below are pure and unit-tested.
//
// Web search: the spec calls for web-search-backed research of admitted-student profiles. The
// merged AI reference (goal-tracker) uses plain InvokeModel, so we mirror that here and rely on the
// model's knowledge; wiring the Bedrock web_search tool is a follow-up and does not change this
// module's public surface.

import { ApiError } from '../../shared/api/index.js';
import { majorPhrase } from '../../shared/ai/major.js';
import { packFocusBriefs } from '../../shared/packs/index.js';
import type { College } from '../../shared/data/index.js';
import type { KeiraStats } from './stats.js';
import type { MatrixRow } from './compare.js';

/** The competitive-profile fields the AI researches for a college (a subset of `Benchmark`). */
export interface ResearchedProfile {
  avgGPAAdmitted?: number;
  avgTEASScore?: number;
  avgSATScore?: number;
  typicalClinicalHours?: number;
  typicalVolunteerHours?: number;
  typicalCertifications?: string[];
  typicalExtracurriculars?: string;
  competitiveEdges?: string[];
}

/** One AI-identified gap with a concrete recommendation. */
export interface Gap {
  metric: string;
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface GapsAnalysis {
  summary: string;
  gaps: Gap[];
}

/** The pluggable AI backend. The production binding calls Bedrock; tests inject a fake. */
export interface BenchmarkResearcher {
  research(college: College, focus?: string, majors?: string[]): Promise<ResearchedProfile>;
  analyzeGaps(stats: KeiraStats, rows: readonly MatrixRow[], majors?: string[]): Promise<GapsAnalysis>;
}

/** Raw model invocation: prompt in, completion text out. Keeps the AWS SDK out of the pure
 *  prompt/parse path so `makeResearcher` is unit-testable with a fake invoker. */
export type ModelInvoker = (prompt: string) => Promise<string>;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
const strList = (v: unknown, max: number, each = 200): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, each))
    .slice(0, max);
  return out.length ? out : undefined;
};

/** Extract the first balanced JSON object from possibly-prose model output. */
function firstJsonObject(raw: string): Record<string, unknown> | undefined {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function buildResearchPrompt(college: College, focus?: string, majors: string[] = []): string {
  // The student's intended major(s) (from their profile) steer the research + fold in matching pack
  // guidance; with none set we keep the language generic. `focus` carries any extra steer.
  const program = majorPhrase(majors, 'undergraduate');
  const briefs = packFocusBriefs(majors);
  const lines = [
    `You research competitive admission profiles for ${program} programs.`,
    `Describe the TYPICAL admitted student to the program at "${college.name}"${
      college.location ? ` (${college.location})` : ''
    }.`,
    ...briefs,
    college.programType ? `Program type: ${college.programType}.` : '',
    focus ? `Focus: ${focus}.` : '',
    'Report realistic numbers a competitive applicant would target. Use a 0–100 entrance-exam scale and a 4.0 GPA scale.',
    'Return ONLY a JSON object, no prose. (avgTEASScore = typical entrance-exam score; typicalClinicalHours = typical hands-on experience hours):',
    '{"avgGPAAdmitted": number, "avgTEASScore": number, "avgSATScore": number, "typicalClinicalHours": number,',
    ' "typicalVolunteerHours": number, "typicalCertifications": string[], "typicalExtracurriculars": string,',
    ' "competitiveEdges": string[]}',
  ];
  return lines.filter(Boolean).join('\n');
}

export function parseResearch(raw: string): ResearchedProfile {
  const o = firstJsonObject(raw);
  if (!o) return {};
  const profile: ResearchedProfile = {};
  const gpa = num(o.avgGPAAdmitted);
  if (gpa !== undefined) profile.avgGPAAdmitted = gpa;
  const teas = num(o.avgTEASScore);
  if (teas !== undefined) profile.avgTEASScore = teas;
  const sat = num(o.avgSATScore);
  if (sat !== undefined) profile.avgSATScore = sat;
  const clin = num(o.typicalClinicalHours);
  if (clin !== undefined) profile.typicalClinicalHours = clin;
  const vol = num(o.typicalVolunteerHours);
  if (vol !== undefined) profile.typicalVolunteerHours = vol;
  const certs = strList(o.typicalCertifications, 30, 120);
  if (certs) profile.typicalCertifications = certs;
  const extra = str(o.typicalExtracurriculars, 2000);
  if (extra) profile.typicalExtracurriculars = extra;
  const edges = strList(o.competitiveEdges, 20, 300);
  if (edges) profile.competitiveEdges = edges;
  return profile;
}

export function buildGapsPrompt(stats: KeiraStats, rows: readonly MatrixRow[], majors: string[] = []): string {
  const program = majorPhrase(majors, 'their intended college');
  const briefs = packFocusBriefs(majors);
  const targets = rows
    .filter((r) => r.benchmark.hasData)
    .map(
      (r) =>
        `- ${r.collegeName}: GPA ${r.benchmark.avgGPAAdmitted ?? '?'}, entrance exam ${r.benchmark.avgTEASScore ?? '?'}, ` +
        `experience ${r.benchmark.typicalClinicalHours ?? '?'}h, volunteer ${r.benchmark.typicalVolunteerHours ?? '?'}h`,
    )
    .join('\n');
  return [
    `You advise a student applying to ${program} programs. Identify their biggest competitive gaps`,
    'and give specific, actionable recommendations to close them.',
    ...briefs,
    `Their current stats: GPA ${stats.gpa ?? 'n/a'}, best entrance-exam score ${stats.teasScore ?? 'not taken'}, ` +
      `experience hours ${stats.clinicalHours}, volunteer hours ${stats.volunteerHours}, ` +
      `certifications: ${stats.certifications.join(', ') || 'none'}.`,
    targets ? `Target schools (typical admitted student):\n${targets}` : 'No school benchmarks available yet.',
    'Return ONLY a JSON object, no prose:',
    '{"summary": string, "gaps": [{"metric": string, "severity": "high"|"medium"|"low", "recommendation": string}]}',
  ].join('\n');
}

export function parseGaps(raw: string): GapsAnalysis {
  const o = firstJsonObject(raw);
  const summary = str(o?.summary, 4000) ?? '';
  const gaps: Gap[] = [];
  const list = o?.gaps;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue;
      const r = item as Record<string, unknown>;
      const metric = str(r.metric, 120);
      const recommendation = str(r.recommendation, 2000);
      if (!metric || !recommendation) continue;
      const severity = r.severity === 'high' || r.severity === 'medium' || r.severity === 'low' ? r.severity : 'medium';
      gaps.push({ metric, severity, recommendation });
      if (gaps.length >= 20) break;
    }
  }
  return { summary, gaps };
}

/**
 * Compose a researcher from a model invoker. `research` is an explicit user action (the Refresh
 * button), so an invocation failure SURFACES as a clean 502 rather than silently persisting an
 * empty benchmark and stamping lastDataRefresh as if it succeeded. Unparseable model output is
 * still tolerated (`parseResearch` returns `{}` without throwing). `analyzeGaps` likewise rejects
 * on failure so the gaps view says "try again" instead of rendering an empty analysis as real.
 */
export function makeResearcher(invoke: ModelInvoker): BenchmarkResearcher {
  return {
    async research(college, focus, majors) {
      try {
        return parseResearch(await invoke(buildResearchPrompt(college, focus, majors)));
      } catch (err) {
        if (err instanceof ApiError) throw err; // a configured-but-unavailable 503 must propagate
        console.error('peer-benchmark: AI research failed', err);
        throw new ApiError(502, 'internal', 'Benchmark research could not be completed right now. Please try again.');
      }
    },
    async analyzeGaps(stats, rows, majors) {
      try {
        return parseGaps(await invoke(buildGapsPrompt(stats, rows, majors)));
      } catch (err) {
        console.error('peer-benchmark: AI gaps analysis failed', err);
        throw new ApiError(502, 'internal', 'The gaps analysis could not be generated right now. Please try again.');
      }
    },
  };
}

/**
 * Fallback for environments without Bedrock configured (local dev, or a Lambda missing
 * BEDROCK_MODEL_ID): a clean 503 so the UI says "AI research isn't enabled" rather than 500ing.
 */
export const unavailableResearcher: BenchmarkResearcher = {
  research() {
    return Promise.reject(
      new ApiError(503, 'unavailable', 'AI benchmark research is not yet enabled in this environment.'),
    );
  },
  analyzeGaps() {
    return Promise.reject(
      new ApiError(503, 'unavailable', 'AI gaps analysis is not yet enabled in this environment.'),
    );
  },
};
