// Pure, framework-free helpers for the Application Central UI. Unit-tested in the node environment.

import type { BadgeTone } from '../../shared/ui';
import type {
  ApplicationDecision,
  ApplicationRow,
  Essay,
  EssayDraft,
  EssayStatus,
  RecommendationSlot,
  RecommendationStatus,
} from './types';

export const ESSAY_STATUS_META: Record<EssayStatus, { label: string; tone: BadgeTone }> = {
  brainstorming: { label: 'Brainstorming', tone: 'neutral' },
  drafting: { label: 'Drafting', tone: 'info' },
  reviewing: { label: 'Reviewing', tone: 'warn' },
  final: { label: 'Final', tone: 'success' },
};

export const SLOT_LABELS: Record<RecommendationSlot, string> = {
  'stem-teacher': 'STEM teacher',
  'humanities-teacher': 'Humanities teacher',
  'clinical-supervisor': 'Clinical / volunteer supervisor',
  'community-leader': 'Community leader',
  other: 'Other',
};

export const RECOMMENDATION_STATUS_META: Record<RecommendationStatus, { label: string; tone: BadgeTone }> = {
  identified: { label: 'Identified', tone: 'neutral' },
  asked: { label: 'Asked', tone: 'info' },
  agreed: { label: 'Agreed', tone: 'info' },
  received: { label: 'Received', tone: 'success' },
  submitted: { label: 'Submitted', tone: 'success' },
  declined: { label: 'Declined', tone: 'error' },
};

export const DECISION_META: Record<ApplicationDecision, { label: string; tone: BadgeTone }> = {
  none: { label: 'Pending', tone: 'neutral' },
  accepted: { label: 'Accepted', tone: 'success' },
  waitlisted: { label: 'Waitlisted', tone: 'warn' },
  deferred: { label: 'Deferred', tone: 'warn' },
  rejected: { label: 'Rejected', tone: 'error' },
};

/** Net cost rendered for the decision matrix, falling back to total then "—". */
export function netCostLabel(after?: number, total?: number): string {
  const v = after ?? total;
  return v === undefined ? '—' : `$${v.toLocaleString('en-US')}`;
}

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
