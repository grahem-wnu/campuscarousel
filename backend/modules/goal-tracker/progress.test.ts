import { describe, expect, it } from 'vitest';
import { clampProgress, normaliseMilestones, progressFromMilestones, type Milestone } from './progress.js';

describe('clampProgress', () => {
  it('rounds and clamps into [0, 100]', () => {
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(150)).toBe(100);
    expect(clampProgress(33.4)).toBe(33);
    expect(clampProgress(66.6)).toBe(67);
  });

  it('treats non-finite input as 0', () => {
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('progressFromMilestones', () => {
  it('returns null with no milestones (caller falls back to manual progress)', () => {
    expect(progressFromMilestones(undefined)).toBeNull();
    expect(progressFromMilestones([])).toBeNull();
  });

  it('is the completed share as a 0-100 integer', () => {
    const ms: Milestone[] = [
      { id: 'a', label: 'one', completed: true },
      { id: 'b', label: 'two', completed: false },
      { id: 'c', label: 'three', completed: true },
      { id: 'd', label: 'four', completed: false },
    ];
    expect(progressFromMilestones(ms)).toBe(50);
    expect(progressFromMilestones([{ id: 'a', label: 'x', completed: true }])).toBe(100);
    expect(progressFromMilestones([{ id: 'a', label: 'x', completed: false }])).toBe(0);
  });
});

describe('normaliseMilestones', () => {
  let n = 0;
  const genId = () => `gen-${++n}`;

  it('returns undefined when not provided (untouched on patch)', () => {
    expect(normaliseMilestones(undefined, genId, '2026-06-06')).toBeUndefined();
  });

  it('stamps ids on milestones that lack them and preserves existing ids', () => {
    n = 0;
    const out = normaliseMilestones(
      [
        { label: 'no id' },
        { id: 'keep', label: 'has id' },
      ],
      genId,
      '2026-06-06',
    );
    expect(out?.[0]?.id).toBe('gen-1');
    expect(out?.[1]?.id).toBe('keep');
  });

  it('stamps completedDate the first time a milestone reads completed', () => {
    const out = normaliseMilestones([{ id: 'a', label: 'x', completed: true }], genId, '2026-06-06');
    expect(out?.[0]?.completedDate).toBe('2026-06-06');
  });

  it('keeps a caller-supplied completedDate and clears it when not completed', () => {
    const out = normaliseMilestones(
      [
        { id: 'a', label: 'kept', completed: true, completedDate: '2026-01-01' },
        { id: 'b', label: 'reopened', completed: false, completedDate: '2026-01-01' },
      ],
      genId,
      '2026-06-06',
    );
    expect(out?.[0]?.completedDate).toBe('2026-01-01');
    expect(out?.[1]?.completedDate).toBeUndefined();
    expect(out?.[1]?.completed).toBe(false);
  });
});
