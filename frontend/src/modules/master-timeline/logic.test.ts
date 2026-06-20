import { describe, expect, it } from 'vitest';
import { SOURCE_DOT, countdownLabel, eventLink, eventsByDate, groupUpcoming, monthGrid, monthLabel } from './logic';
import type { TimelineEvent, UpcomingEvent } from './types';

const up = (o: Partial<UpcomingEvent>): UpcomingEvent => ({ id: 'e', date: '2026-06-10', source: 'goal', type: 'deadline', title: 'X', daysUntil: 4, group: 'this-week', ...o });

describe('SOURCE_DOT — design-system tokens only', () => {
  it('every source dot uses a frozen token scale (no raw hex, no non-existent `info`)', () => {
    const scales = ['primary', 'secondary', 'ink', 'success', 'warn', 'error'];
    for (const cls of Object.values(SOURCE_DOT)) {
      expect(cls).not.toContain('bg-['); // no raw hex
      expect(cls).not.toContain('info'); // no non-existent info scale
      expect(scales.some((s) => cls.startsWith(`bg-${s}-`))).toBe(true);
    }
  });
});

describe('groupUpcoming', () => {
  it('buckets events by group in canonical order, dropping empty groups', () => {
    const events = [up({ group: 'overdue', daysUntil: -2 }), up({ group: 'this-week', daysUntil: 3 }), up({ group: 'this-month', daysUntil: 20 })];
    expect(groupUpcoming(events).map((g) => g.group)).toEqual(['overdue', 'this-week', 'this-month']);
  });
});

describe('countdownLabel', () => {
  it('phrases overdue/today/tomorrow/days, and months/years for far-out dates', () => {
    expect(countdownLabel(-3)).toBe('3d overdue');
    expect(countdownLabel(0)).toBe('today');
    expect(countdownLabel(1)).toBe('tomorrow');
    expect(countdownLabel(9)).toBe('in 9d');
    expect(countdownLabel(90)).toBe('in 3 mo');
    expect(countdownLabel(880)).toBe('in ~2 yr'); // a sophomore's application deadline
  });
});

describe('eventsByDate / monthGrid / monthLabel', () => {
  it('keys events by date', () => {
    const events: TimelineEvent[] = [{ id: '1', date: '2026-06-10', source: 'goal', type: 'd', title: 'A' }, { id: '2', date: '2026-06-10', source: 'college', type: 'rd', title: 'B' }];
    expect(eventsByDate(events)['2026-06-10']).toHaveLength(2);
  });
  it('builds a 42-cell month grid flagging in-month days', () => {
    const grid = monthGrid(2026, 5); // June 2026
    expect(grid).toHaveLength(42);
    expect(grid.some((c) => c.iso === '2026-06-01' && c.inMonth)).toBe(true);
    expect(monthLabel(2026, 5)).toBe('Jun 2026');
  });
});

describe('eventLink', () => {
  it('deep-links a college event to that college, others to their module', () => {
    expect(eventLink({ source: 'college', collegeId: 'c1' })).toBe('/colleges/c1');
    expect(eventLink({ source: 'college' })).toBe('/colleges'); // no id → the hub
    expect(eventLink({ source: 'teas' })).toBe('/exams');
    expect(eventLink({ source: 'visit' })).toBe('/visits');
    expect(eventLink({ source: 'scholarship' })).toBe('/scholarships');
    expect(eventLink({ source: 'certification' })).toBe('/certifications');
    expect(eventLink({ source: 'goal' })).toBe('/goals');
    expect(eventLink({ source: 'activity' })).toBe('/journal');
  });
});
