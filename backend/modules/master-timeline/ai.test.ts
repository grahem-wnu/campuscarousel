import { describe, expect, it } from 'vitest';
import { curatedAnalyzer, extractJson, makeBedrockAnalyzer, type BedrockInvoker } from './ai.js';
import { buildEvents, upcoming, type EventSources } from './events.js';
import type { College, Goal, Scholarship } from '../../shared/data/index.js';

const TODAY = '2026-06-06';
const MODEL = 'us.anthropic.test-model';
function stub(text: string): BedrockInvoker {
  return { send: async () => ({ body: new TextEncoder().encode(JSON.stringify({ content: [{ text }] })) }) };
}
const throwing: BedrockInvoker = { send: async () => { throw new Error('Throttle'); } };

function ctx(sources: Partial<EventSources>) {
  const full: EventSources = { activities: [], goals: [], colleges: [], teas: [], visits: [], scholarships: [], certifications: [], ...sources };
  const all = buildEvents(full);
  return { events: upcoming(all, TODAY, 90), allEvents: all, todayIso: TODAY };
}

describe('extractJson', () => {
  it('extracts JSON tolerating fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe('curatedAnalyzer', () => {
  it('flags overdue priorities, clustered-deadline conflicts, and missing items', async () => {
    const goals: Goal[] = [{ goalId: 'o', title: 'Overdue goal', status: 'in-progress', targetDate: '2026-05-01', createdAt: 'x', updatedAt: 'x' }];
    const colleges: College[] = [{ collegeId: 'c', name: 'OSU', status: 'applying', applicationDeadlines: { regularDecision: '2026-06-15' }, createdAt: 'x', updatedAt: 'x' }];
    const scholarships: Scholarship[] = [{ scholarshipId: 's', name: 'Merit', applicationDeadline: '2026-06-16', status: 'researching', createdAt: 'x', updatedAt: 'x' }];
    const a = await curatedAnalyzer(ctx({ goals, colleges, scholarships }));
    expect(a.source).toBe('curated');
    expect(a.priorities.join(' ')).toMatch(/Overdue/);
    expect(a.conflicts.join(' ')).toMatch(/1d apart|same day/); // OSU 06-15 & Merit 06-16
    expect(a.missing.join(' ')).toMatch(/TEAS/); // no teas event
  });

  it('reports good coverage when exams/apps/visits exist', async () => {
    const a = await curatedAnalyzer(
      ctx({
        teas: [{ recordId: 't', type: 'official-exam', date: '2026-08-01', createdAt: 'x', updatedAt: 'x' }],
        colleges: [{ collegeId: 'c', name: 'OSU', status: 'applying', applicationDeadlines: { regularDecision: '2026-12-01' }, createdAt: 'x', updatedAt: 'x' }],
        visits: [{ visitId: 'v', collegeId: 'c', date: '2026-09-01', createdAt: 'x', updatedAt: 'x' }],
      }),
    );
    expect(a.missing.join(' ')).toMatch(/Good coverage/);
  });
});

describe('makeBedrockAnalyzer', () => {
  it('uses model output and falls back on failure', { timeout: 30000 }, async () => {
    const ok = makeBedrockAnalyzer({ modelId: MODEL, client: stub(JSON.stringify({ priorities: ['do X'], conflicts: [], missing: ['add Y'] })) });
    const a = await ok(ctx({}));
    expect(a.source).toBe('ai');
    expect(a.priorities).toEqual(['do X']);
    expect((await makeBedrockAnalyzer({ modelId: MODEL, client: throwing })(ctx({}))).source).toBe('curated');
  });
});
