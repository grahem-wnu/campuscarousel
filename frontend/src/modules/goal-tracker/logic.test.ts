import { describe, expect, it } from 'vitest';
import {
  displayProgress,
  filterBySearch,
  groupByPeriod,
  groupByStatus,
  isAutoProgress,
  milestoneProgress,
} from './logic';
import type { Goal } from './types';

const goal = (over: Partial<Goal> = {}): Goal => ({
  goalId: Math.random().toString(36).slice(2),
  title: 'Goal',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...over,
});

describe('milestoneProgress', () => {
  it('is null with no milestones', () => {
    expect(milestoneProgress(undefined)).toBeNull();
    expect(milestoneProgress([])).toBeNull();
  });

  it('is the completed share rounded to a percent', () => {
    expect(
      milestoneProgress([
        { id: 'a', label: 'x', completed: true },
        { id: 'b', label: 'y' },
        { id: 'c', label: 'z', completed: true },
      ]),
    ).toBe(67);
  });
});

describe('displayProgress / isAutoProgress', () => {
  it('uses milestone completion when milestones exist (auto)', () => {
    const g = goal({ progress: 10, milestones: [{ id: 'a', label: 'x', completed: true }] });
    expect(displayProgress(g)).toBe(100);
    expect(isAutoProgress(g)).toBe(true);
  });

  it('falls back to the manual value with no milestones', () => {
    const g = goal({ progress: 35 });
    expect(displayProgress(g)).toBe(35);
    expect(isAutoProgress(g)).toBe(false);
  });

  it('is 0 when neither is set', () => {
    expect(displayProgress(goal())).toBe(0);
  });
});

describe('groupByStatus', () => {
  it('buckets goals into board columns; deferred/dropped stay off the three', () => {
    const groups = groupByStatus([
      goal({ status: 'in-progress' }),
      goal({ status: 'completed' }),
      goal({ status: 'completed' }),
      goal(), // no status → not-started
      goal({ status: 'deferred' }),
    ]);
    expect(groups['not-started']).toHaveLength(1);
    expect(groups['in-progress']).toHaveLength(1);
    expect(groups.completed).toHaveLength(2);
    expect(groups.deferred).toHaveLength(1);
  });
});

describe('groupByPeriod', () => {
  it('groups and sorts by period, with Unscheduled last', () => {
    const groups = groupByPeriod([
      goal({ period: 'Senior Year' }),
      goal({ title: 'no period' }),
      goal({ period: 'Junior Year' }),
      goal({ period: 'Junior Year' }),
    ]);
    expect(groups.map((g) => g.period)).toEqual(['Junior Year', 'Senior Year', 'Unscheduled']);
    expect(groups[0]?.goals).toHaveLength(2);
  });
});

describe('filterBySearch', () => {
  it('matches title and description, case-insensitive', () => {
    const goals = [
      goal({ title: 'Pass the TEAS' }),
      goal({ title: 'Shadow', description: 'at the hospital' }),
      goal({ title: 'Other' }),
    ];
    expect(filterBySearch(goals, 'teas')).toHaveLength(1);
    expect(filterBySearch(goals, 'HOSPITAL')).toHaveLength(1);
    expect(filterBySearch(goals, '')).toHaveLength(3);
  });
});
