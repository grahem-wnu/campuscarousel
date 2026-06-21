import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { makeHandlers, type TimelineHandlers } from './handlers.js';
import type { Analyzer } from './ai.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };
const now = () => new Date('2026-06-06T00:00:00Z');

let data: Data;
let h: TimelineHandlers;
const stubAnalyzer: Analyzer = async ({ events, allEvents }) => ({
  priorities: events.map((e) => e.title),
  conflicts: [],
  missing: [`all=${allEvents.length}`],
  source: 'curated',
});

beforeEach(async () => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers({ getData: () => data, now, analyzer: stubAnalyzer });
  // family + private activities (private dated near today so it would appear in the window)
  await data.activities.create({ userId: 'keira', date: '2026-06-10', category: 'volunteer', title: 'Family volunteering', visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
  await data.activities.create({ userId: 'keira', date: '2026-06-12', category: 'personal', title: 'Private reflection', visibility: 'private' } as Parameters<Data['activities']['create']>[0]);
  await data.goals.create({ title: 'Submit OSU app', status: 'in-progress', targetDate: '2026-07-01' } as Parameters<Data['goals']['create']>[0]);
  const c = await data.colleges.create({ name: 'OSU', status: 'applying', isTopPick: true, applicationDeadlines: { regularDecision: '2026-12-01' } } as Parameters<Data['colleges']['create']>[0]);
  await data.visits.add(c.collegeId, { date: '2026-09-01', visitType: 'campus-tour' } as Parameters<Data['visits']['add']>[1]);
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({ requester: keira, params: {}, query: {}, body: undefined, ...over });

describe('GET /timeline', () => {
  it('aggregates deadline/milestone sources and excludes journal entries (activities)', async () => {
    const b = (await h.timeline(ctx())).body as { events: { source: string; title: string }[] };
    expect(new Set(b.events.map((e) => e.source))).toEqual(new Set(['goal', 'college', 'visit']));
    expect(b.events.some((e) => e.source === 'activity')).toBe(false);
    expect(b.events.some((e) => e.title === 'Family volunteering')).toBe(false);
    expect(b.events.some((e) => e.title === 'Private reflection')).toBe(false);
  });

  it('shows the same timeline to a parent and the student (no visibility-bearing source remains)', async () => {
    const forKeira = (await h.timeline(ctx())).body as { events: { source: string }[] };
    const forParent = (await h.timeline(ctx({ requester: kate }))).body as { events: { source: string }[] };
    expect(forParent.events.map((e) => e.source).sort()).toEqual(forKeira.events.map((e) => e.source).sort());
  });

  it('filters by source', async () => {
    const b = (await h.timeline(ctx({ query: { source: 'college' } }))).body as { events: { source: string }[] };
    expect(b.events.every((e) => e.source === 'college')).toBe(true);
  });

  it('only TOP-PICK colleges put their deadlines on the timeline (opt-in)', async () => {
    // A discovered-but-not-picked college with a deadline (OSU from the beforeEach IS a top pick).
    await data.colleges.create({
      name: 'Backup U',
      status: 'researching',
      applicationDeadlines: { regularDecision: '2026-11-15' },
    } as Parameters<Data['colleges']['create']>[0]);
    const titles = ((await h.timeline(ctx())).body as { events: { title: string; source: string }[] }).events
      .filter((e) => e.source === 'college')
      .map((e) => e.title);
    expect(titles.some((t) => t.includes('OSU'))).toBe(true); // top pick → on the timeline
    expect(titles.some((t) => t.includes('Backup U'))).toBe(false); // not a pick → excluded
  });
});

describe('GET /timeline/upcoming', () => {
  it('returns overdue+horizon events with a horizon echo, private excluded for a parent', async () => {
    const b = (await h.upcoming(ctx({ requester: kate, query: { horizon: '120' } }))).body as { events: { title: string; daysUntil: number }[]; horizon: number };
    expect(b.horizon).toBe(120);
    expect(b.events.every((e) => typeof e.daysUntil === 'number')).toBe(true);
    expect(b.events.some((e) => e.title === 'Private reflection')).toBe(false);
  });
});

describe('POST /timeline/analyze', () => {
  it('passes the deadline window to the analyzer, excluding journal entries', async () => {
    const b = (await h.analyze(ctx({ body: {} }))).body as { analysis: { priorities: string[] } };
    expect(b.analysis.priorities).toContain('Submit OSU app'); // a real deadline is in the window
    expect(b.analysis.priorities).not.toContain('Private reflection'); // journal entries are excluded
    expect(b.analysis.priorities).not.toContain('Family volunteering');
  });
});
