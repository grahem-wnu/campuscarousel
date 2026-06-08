import { describe, expect, it } from 'vitest';
import { DECISION_META, deadlineLabel, essaySummary, latestDraft, netCostLabel, RECOMMENDATION_STATUS_META, SLOT_LABELS, wordCount, wordTargetTone } from './logic';
import type { ApplicationRow, Essay } from './types';

const row = (over: Partial<ApplicationRow>): ApplicationRow => ({
  collegeId: 'c',
  name: 'C',
  nextDeadline: null,
  daysUntilDeadline: null,
  essays: { total: 0, final: 0, statuses: [] },
  hasTeasScore: false,
  ...over,
});

describe('wordCount', () => {
  it('counts words, ignoring extra whitespace', () => {
    expect(wordCount('  one   two three ')).toBe(3);
    expect(wordCount('')).toBe(0);
  });
});

describe('latestDraft', () => {
  it('returns the last draft or null', () => {
    const essay: Essay = { essayId: 'e', createdAt: 'x', updatedAt: 'x', drafts: [{ version: 1, content: 'a', createdAt: 'x' }, { version: 2, content: 'b', createdAt: 'x' }] };
    expect(latestDraft(essay)?.version).toBe(2);
    expect(latestDraft({ essayId: 'e', createdAt: 'x', updatedAt: 'x' })).toBeNull();
  });
});

describe('deadlineLabel', () => {
  it('color-codes by urgency', () => {
    expect(deadlineLabel(row({ nextDeadline: { label: 'RD', date: '2026-12-01' }, daysUntilDeadline: 5 }))).toMatchObject({ tone: 'error' });
    expect(deadlineLabel(row({ nextDeadline: { label: 'RD', date: '2026-12-01' }, daysUntilDeadline: 30 }))).toMatchObject({ tone: 'warn' });
    expect(deadlineLabel(row({ nextDeadline: { label: 'RD', date: '2026-12-01' }, daysUntilDeadline: 120 }))).toMatchObject({ tone: 'neutral' });
    expect(deadlineLabel(row({}))).toBeNull();
  });
});

describe('essaySummary', () => {
  it('summarizes essay readiness', () => {
    expect(essaySummary(row({ essays: { total: 0, final: 0, statuses: [] } }))).toMatchObject({ tone: 'neutral' });
    expect(essaySummary(row({ essays: { total: 2, final: 2, statuses: [] } }))).toMatchObject({ text: '2/2 final', tone: 'success' });
    expect(essaySummary(row({ essays: { total: 2, final: 1, statuses: [] } }))).toMatchObject({ tone: 'warn' });
  });
});

describe('wordTargetTone', () => {
  it('is success within tolerance, warn outside, neutral with no target', () => {
    expect(wordTargetTone(500, 500)).toBe('success');
    expect(wordTargetTone(520, 500)).toBe('success');
    expect(wordTargetTone(700, 500)).toBe('warn');
    expect(wordTargetTone(500)).toBe('neutral');
  });
});

describe('decision + recommender metadata', () => {
  it('maps every decision and recommendation status to a label + tone', () => {
    expect(DECISION_META.accepted).toMatchObject({ tone: 'success' });
    expect(DECISION_META.rejected).toMatchObject({ tone: 'error' });
    expect(DECISION_META.none.label).toBe('Pending');
    expect(RECOMMENDATION_STATUS_META.submitted.tone).toBe('success');
    expect(SLOT_LABELS['clinical-supervisor']).toMatch(/clinical/i);
  });

  it('netCostLabel prefers net cost, falls back to total, then dash', () => {
    expect(netCostLabel(18000, 60000)).toBe('$18,000');
    expect(netCostLabel(undefined, 60000)).toBe('$60,000');
    expect(netCostLabel(undefined, undefined)).toBe('—');
  });
});
