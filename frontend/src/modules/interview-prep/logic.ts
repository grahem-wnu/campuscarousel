// Pure, framework-free helpers for the Interview Prep UI. Unit-tested in the node environment.

import type { BadgeTone } from '../../shared/ui';
import type { Category, Interview, QuestionEntry } from './types';

export const CATEGORY_LABEL: Record<Category, string> = {
  motivation: 'Motivation',
  behavioral: 'Behavioral',
  clinical: 'Clinical',
  situational: 'Situational',
  'school-specific': 'School-specific',
  ethics: 'Ethics',
  general: 'General',
};

/** Tone for a 1–5 coaching rating. */
export function ratingTone(rating: number | undefined): BadgeTone {
  if (rating === undefined) return 'neutral';
  if (rating >= 4) return 'success';
  if (rating >= 3) return 'warn';
  return 'error';
}

/** Answered questions across a session (those with a rating). */
export function answeredQuestions(session: Interview): QuestionEntry[] {
  return (session.questions ?? []).filter((q) => q.rating !== undefined);
}

export interface HistoryStats {
  sessions: number;
  answered: number;
  avgRating: number | null;
  /** Average rating over time, oldest → newest (one point per mock session that has ratings). */
  trend: { date: string; avg: number }[];
  strongest: { question: string; rating: number } | null;
  weakest: { question: string; rating: number } | null;
}

const avg = (nums: number[]): number | null =>
  nums.length ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10 : null;

/** Roll up mock-interview history: averages, per-session trend, and strongest/weakest answers. */
export function historyStats(sessions: readonly Interview[]): HistoryStats {
  const mocks = sessions
    .filter((s) => s.type === 'mock-practice')
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const allRated: { question: string; rating: number }[] = [];
  const trend: { date: string; avg: number }[] = [];
  for (const s of mocks) {
    const rated = answeredQuestions(s).map((q) => ({ question: q.question, rating: q.rating! }));
    allRated.push(...rated);
    const a = avg(rated.map((r) => r.rating));
    if (a !== null) trend.push({ date: s.date, avg: a });
  }

  const sorted = [...allRated].sort((a, b) => b.rating - a.rating);
  return {
    sessions: mocks.length,
    answered: allRated.length,
    avgRating: avg(allRated.map((r) => r.rating)),
    trend,
    strongest: sorted[0] ?? null,
    weakest: sorted.length ? sorted[sorted.length - 1]! : null,
  };
}

/** Merge a freshly dictated phrase into the existing answer text, with sensible spacing (one space
 *  between the prior text and the new phrase, no leading space on an empty field, trimmed addition). */
export function appendDictation(existing: string, addition: string): string {
  const add = addition.trim();
  if (!add) return existing;
  const base = existing.replace(/\s+$/, '');
  return base ? `${base} ${add}` : add;
}

/** Progress through a mock: how many of its questions have been answered. */
export function mockProgress(session: Interview): { answered: number; total: number } {
  const total = session.questions?.length ?? 0;
  return { answered: answeredQuestions(session).length, total };
}
