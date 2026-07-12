import { describe, expect, it } from 'vitest';
import type { Activity, College, ReminderRecipient } from '../../shared/data/index.js';
import { digestForRecipient, eventsFor, type GatheredData } from './digest.js';

const activity = (o: Partial<Activity>): Activity => ({
  activityId: 'a1',
  userId: 'keira',
  date: '2026-06-20',
  category: 'volunteer',
  title: 'Soup kitchen',
  visibility: 'family',
  createdAt: 'x',
  updatedAt: 'x',
  ...o,
});

const college = (o: Partial<College>): College =>
  ({ collegeId: 'c1', name: 'College', status: 'researching', addedBy: 'ai-discovered', userEdited: [], createdAt: 'x', updatedAt: 'x', ...o }) as College;

const empty: GatheredData = {
  activities: [],
  goals: [],
  colleges: [],
  exams: [],
  visits: [],
  scholarships: [],
  certifications: [],
  finaid: [],
};

const keira: ReminderRecipient = { label: 'Keira', email: 'k@x.com' };
const mom: ReminderRecipient = { label: 'Mom', email: 'm@x.com' };

describe('eventsFor — privacy', () => {
  const g: GatheredData = {
    ...empty,
    activities: [
      activity({ activityId: 'fam', visibility: 'family', title: 'Family event' }),
      activity({ activityId: 'priv', visibility: 'private', title: 'Private event' }),
    ],
  };
  it('ALWAYS excludes private activities — they are never emailed to anyone', () => {
    const ids = eventsFor(g).map((e) => e.refId);
    expect(ids).toContain('fam');
    expect(ids).not.toContain('priv');
  });
});

describe('digestForRecipient', () => {
  // today = 2026-06-15, horizon 30 days.
  const g: GatheredData = {
    ...empty,
    // Overdue is a real DEADLINE (a past college application date) — activities can't be overdue.
    colleges: [college({ collegeId: 'od', name: 'Overdue U', applicationDeadlines: { regularDecision: '2026-06-10' } })],
    activities: [
      activity({ activityId: 'soon', date: '2026-06-20', title: 'Soon thing' }),
      activity({ activityId: 'pastlog', date: '2026-06-10', title: 'Past log' }), // past activity → dropped (never overdue)
      activity({ activityId: 'private', date: '2026-06-21', visibility: 'private', title: 'Private thing' }),
      activity({ activityId: 'far', date: '2026-09-01', title: 'Far thing' }),
    ],
  };

  it('groups overdue + upcoming, drops far-future/private, and never marks a past activity overdue', () => {
    const d = digestForRecipient(g, keira, '2026-06-15', 30, 'https://app');
    expect(d.model.count).toBe(2); // overdue college + soon activity; private/far excluded; past activity dropped
    expect(d.text).not.toContain('Private thing');
    expect(d.text).not.toContain('Past log'); // a logged activity in the past is not a deadline
    expect(d.text).toContain('Soon thing'); // today/upcoming activities still appear
    expect(d.model.overdueCount).toBe(1);
    expect(d.subject).toContain('overdue');
    expect(d.text).toContain('Overdue U'); // the overdue item is the college deadline
    expect(d.text).toContain('Open Campus Carousel');
    expect(d.html).toContain('Overdue U');
  });

  it("a parent's digest excludes private-sourced items", () => {
    const d = digestForRecipient(g, mom, '2026-06-15', 30, 'https://app');
    expect(d.text).not.toContain('Private thing');
    expect(d.model.count).toBe(2);
  });

  it('excludes already-notified events (never repeat)', () => {
    const full = digestForRecipient(g, keira, '2026-06-15', 30, 'https://app');
    const firstId = full.model.sections[0]!.items[0]!.id;
    const d = digestForRecipient(g, keira, '2026-06-15', 30, 'https://app', new Set([firstId]));
    expect(d.model.count).toBe(full.model.count - 1);
    expect(d.text).not.toContain(full.model.sections[0]!.items[0]!.title);
  });

  it('renders a friendly all-clear when nothing is due', () => {
    const d = digestForRecipient(empty, mom, '2026-06-15', 30, 'https://app');
    expect(d.model.count).toBe(0);
    expect(d.subject).toContain('nothing due');
    expect(d.text).toContain('all caught up');
  });
});
