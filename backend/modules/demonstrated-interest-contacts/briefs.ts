// AI recommender-brief generation. The Bedrock call is injected (the `Briefer` interface) exactly
// like the data client; the prompt builder is pure and unit-tested. A brief is a one-page summary
// of Keira's activities/goals/achievements that she can hand a recommender. Mirrors goal-tracker.

import { ApiError } from '../../shared/api/index.js';
import type { Activity, Contact, Goal } from '../../shared/data/index.js';

/** The data a brief is built from — already visibility-filtered for the caller by the handler. */
export interface BriefSources {
  activities: readonly Activity[];
  goals: readonly Goal[];
}

export interface Briefer {
  brief(contact: Contact, sources: BriefSources, focus?: string): Promise<string>;
}

export type ModelInvoker = (prompt: string) => Promise<string>;

/** Build the brief prompt. Deterministic + side-effect free so it can be asserted in tests. */
export function buildBriefPrompt(contact: Contact, sources: BriefSources, focus?: string): string {
  const lines: string[] = [
    'Write a concise one-page recommender brief that helps this person write a strong letter of',
    'recommendation for the student, a high-school student applying to their intended college programs.',
    `Recommender: ${contact.name}${contact.role ? `, ${contact.role}` : ''}${
      contact.organization ? ` at ${contact.organization}` : ''
    }${contact.relationship ? ` (relationship: ${contact.relationship})` : ''}.`,
  ];
  if (focus) lines.push(`Emphasis: ${focus}.`);
  if (sources.activities.length) {
    lines.push('', 'The student’s activities:');
    for (const a of sources.activities.slice(0, 12)) {
      lines.push(`- ${a.title}${a.description ? `: ${a.description.slice(0, 160)}` : ''}`);
    }
  }
  if (sources.goals.length) {
    lines.push('', 'The student’s goals:');
    for (const g of sources.goals.slice(0, 8)) lines.push(`- ${g.title}`);
  }
  lines.push(
    '',
    'Output a warm, specific, factual brief (about one page): who the student is, concrete strengths with',
    'examples drawn ONLY from the data above, and what this recommender is best positioned to speak to.',
    'Do not invent facts. Plain prose, no markdown headers.',
  );
  return lines.join('\n');
}

/**
 * Compose a briefer from a model invoker. A failed invocation surfaces as a clean 502 (the brief is
 * an explicit user action; the UI should say "try again", not render an empty brief as real).
 */
export function makeBriefer(invoke: ModelInvoker): Briefer {
  return {
    async brief(contact, sources, focus) {
      try {
        const text = (await invoke(buildBriefPrompt(contact, sources, focus))).trim();
        if (!text) throw new ApiError(502, 'internal', 'The recommender brief came back empty. Please try again.');
        return text;
      } catch (err) {
        if (err instanceof ApiError) throw err;
        console.error('demonstrated-interest-contacts: brief generation failed', err);
        throw new ApiError(502, 'internal', 'The recommender brief could not be generated right now. Please try again.');
      }
    },
  };
}

/** Fallback when Bedrock isn't configured (local / Lambda missing BEDROCK_MODEL_ID): a clean 503. */
export const unavailableBriefer: Briefer = {
  brief() {
    return Promise.reject(new ApiError(503, 'unavailable', 'AI recommender briefs are not yet enabled in this environment.'));
  },
};
