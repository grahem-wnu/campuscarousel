// Pure presentation logic for the essay workspace. No React/network, so unit-tested directly.

import type { BadgeTone } from '../../shared/ui';
import type { Draft, EssayStatus } from './types';

export const STATUS_META: Record<EssayStatus, { label: string; tone: BadgeTone }> = {
  brainstorming: { label: 'Brainstorming', tone: 'neutral' },
  drafting: { label: 'Drafting', tone: 'info' },
  reviewing: { label: 'Reviewing', tone: 'warn' },
  final: { label: 'Final', tone: 'success' },
};

export function wordCount(content: string): number {
  const t = content.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** The highest-version draft, or null. */
export function latestDraft(drafts: Draft[] | undefined): Draft | null {
  if (!drafts || drafts.length === 0) return null;
  return drafts.reduce((latest, d) => (d.version > latest.version ? d : latest));
}

/** Drafts newest-first, for the version history panel. */
export function draftsNewestFirst(drafts: Draft[] | undefined): Draft[] {
  return [...(drafts ?? [])].sort((a, b) => b.version - a.version);
}

export type WordTone = 'neutral' | 'success' | 'warn' | 'error';

/** Compare a word count to a target: within 10% → success, within 25% → warn, else error/neutral. */
export function wordCountTone(count: number, target: number | null): WordTone {
  if (!target || target <= 0) return 'neutral';
  const ratio = count / target;
  if (ratio > 1) return ratio <= 1.05 ? 'success' : 'error'; // over target: tiny over ok, big over bad
  if (ratio >= 0.9) return 'success';
  if (ratio >= 0.75) return 'warn';
  return 'neutral';
}

export const SOURCE_LABEL: Record<SelectedSource, string> = {
  activity: 'Journal',
  clinical: 'Clinical',
  'why-nursing': 'Why Nursing',
};
type SelectedSource = 'activity' | 'clinical' | 'why-nursing';
