// AI goal suggestions for POST /goals/suggest.
//
// The Bedrock call is injected (the `GoalSuggester` interface) exactly like the data client is — so
// the handlers and their tests never reach for AWS, and the live binding is swapped in by the route
// manifest. The prompt builder and the model-output parser below are pure and unit-tested, so when
// the shared Bedrock client lands (see .agent-bus/checkpoints/goal-tracker.md — the backend bundle
// declares no `@aws-sdk/client-bedrock-runtime` dependency, which a module may not add on its own)
// wiring the real call is a few lines.

import { ApiError } from '../../shared/api/index.js';
import { CATEGORIES, type SuggestInput } from './schema.js';

/** One AI-proposed goal. Mirrors the createable shape (a strict subset) so the frontend can drop an
 *  accepted suggestion straight into POST /goals. Nothing here is persisted by /suggest. */
export interface SuggestedGoal {
  title: string;
  description?: string;
  category?: (typeof CATEGORIES)[number];
  period?: string;
  /** Milestone labels only — ids/timestamps are stamped if/when the user saves the goal. */
  milestones?: string[];
}

/** The pluggable AI backend. The production binding calls Bedrock; tests inject a fake. */
export interface GoalSuggester {
  suggest(input: SuggestInput): Promise<SuggestedGoal[]>;
}

const isCategory = (v: unknown): v is SuggestedGoal['category'] =>
  typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);

/** Build the Bedrock prompt from the student's profile context. Deterministic + side-effect free
 *  so it can be asserted in tests. */
export function buildSuggestPrompt(input: SuggestInput): string {
  const count = input.count ?? 6;
  const lines: string[] = [
    'You are an advisor helping a student plan their path toward a BSN (nursing) program.',
    `Suggest ${count} concrete, achievable goals tailored to this student.`,
  ];
  if (input.gradeLevel) lines.push(`Grade level: ${input.gradeLevel}.`);
  if (input.careerGoal) lines.push(`Career goal: ${input.careerGoal}.`);
  if (input.period) lines.push(`Plan these for: ${input.period}.`);
  if (input.currentActivities?.length) {
    lines.push(`Current activities: ${input.currentActivities.join(', ')}.`);
  }
  if (input.targetColleges?.length) {
    lines.push(`Target colleges: ${input.targetColleges.join(', ')}.`);
  }
  lines.push(
    `Each goal must use a category from: ${CATEGORIES.join(', ')}.`,
    'Return ONLY a JSON array, no prose. Each element:',
    '{"title": string, "description": string, "category": string, "period": string, "milestones": string[]}',
  );
  return lines.join('\n');
}

/**
 * Coerce raw model output into clean `SuggestedGoal`s: tolerate a JSON array embedded in prose,
 * drop anything without a usable title, and clamp the shape (unknown categories → omitted, milestone
 * labels stringified). Returns [] on anything unparseable rather than throwing — a bad model day
 * should surface as "no suggestions", not a 500.
 */
export function parseSuggestions(raw: string, limit = 12): SuggestedGoal[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: SuggestedGoal[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    if (!title) continue;
    const suggestion: SuggestedGoal = { title: title.slice(0, 200) };
    if (typeof r.description === 'string' && r.description.trim()) {
      suggestion.description = r.description.trim().slice(0, 10000);
    }
    if (isCategory(r.category)) suggestion.category = r.category;
    if (typeof r.period === 'string' && r.period.trim()) {
      suggestion.period = r.period.trim().slice(0, 120);
    }
    if (Array.isArray(r.milestones)) {
      const labels = r.milestones
        .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
        .map((m) => m.trim().slice(0, 200))
        .slice(0, 100);
      if (labels.length) suggestion.milestones = labels;
    }
    out.push(suggestion);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Production placeholder until the shared Bedrock client exists. Adding
 * `@aws-sdk/client-bedrock-runtime` to backend/package.json is a foundational change a module may
 * not make on its own (file-ownership rule), so it is raised on the checkpoint. Returns a clean 503
 * — every other endpoint, the whole suggest pipeline (prompt + parse), and the frontend flow work
 * today; only the live model call is gated on the dependency.
 */
export const unavailableSuggester: GoalSuggester = {
  suggest() {
    return Promise.reject(
      new ApiError(
        503,
        'unavailable',
        'AI goal suggestions are not yet enabled (pending the shared Bedrock client). You can still add goals manually.',
      ),
    );
  },
};
