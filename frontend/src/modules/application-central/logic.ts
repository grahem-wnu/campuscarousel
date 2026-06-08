// Pure, framework-free helpers for the Application Central UI. Unit-tested in the node environment.

import type { BadgeTone } from '../../shared/ui';
import type { ApplicationRow, Essay, EssayDraft, EssayStatus } from './types';

export const ESSAY_STATUS_META: Record<EssayStatus, { label: string; tone: BadgeTone }> = {
  brainstorming: { label: 'Brainstorming', tone: 'neutral' },
  drafting: { label: 'Drafting', tone: 'info' },
  reviewing: { label: 'Reviewing', tone: 'warn' },
  final: { label: 'Final', tone: 'success' },
};

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The latest draft of an essay, or null. */
export function latestDraft(essay: Essay): EssayDraft | null {
  const drafts = essay.drafts ?? [];
  return drafts.length ? drafts[drafts.length - 1]! : null;
}

/** A short deadline-countdown label + tone for an application row. */
export function deadlineLabel(row: ApplicationRow): { text: string; tone: BadgeTone } | null {
  if (!row.nextDeadline || row.daysUntilDeadline === null) return null;
  const d = row.daysUntilDeadline;
  if (d < 0) return { text: `${row.nextDeadline.label} passed`, tone: 'neutral' };
  if (d === 0) return { text: `${row.nextDeadline.label} today`, tone: 'error' };
  if (d <= 14) return { text: `${row.nextDeadline.label} in ${d}d`, tone: 'error' };
  if (d <= 45) return { text: `${row.nextDeadline.label} in ${d}d`, tone: 'warn' };
  return { text: `${row.nextDeadline.label} ${row.nextDeadline.date}`, tone: 'neutral' };
}

/** Essay readiness summary for an application row. */
export function essaySummary(row: ApplicationRow): { text: string; tone: BadgeTone } {
  const { total, final } = row.essays;
  if (total === 0) return { text: 'No essay', tone: 'neutral' };
  if (final === total) return { text: `${final}/${total} final`, tone: 'success' };
  return { text: `${final}/${total} final`, tone: 'warn' };
}

/** Word-count status vs a target (±10% or 25 words). */
export function wordTargetTone(count: number, target?: number): BadgeTone {
  if (!target) return 'neutral';
  return Math.abs(count - target) <= Math.max(25, target * 0.1) ? 'success' : 'warn';
}
