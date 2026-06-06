import { describe, expect, it } from 'vitest';
import type { Activity, Clinical, WhyNursing } from '../../shared/data/index.js';
import { candidateKey, toExperienceCandidates } from './experiences.js';

const activity = (over: Partial<Activity> = {}): Activity =>
  ({ activityId: 'a1', userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'Hospital volunteer', visibility: 'family', createdAt: 'x', updatedAt: 'x', ...over }) as Activity;
const clinical = (over: Partial<Clinical> = {}): Clinical =>
  ({ entryId: 'c1', date: '2026-02-01', facility: 'Mercy', hours: 4, visibility: 'family', createdAt: 'x', updatedAt: 'x', ...over }) as Clinical;
const why = (over: Partial<WhyNursing> = {}): WhyNursing =>
  ({ entryId: 'w1', date: '2026-03-01', title: 'A moment', content: 'why I want this', visibility: 'family', createdAt: 'x', updatedAt: 'x', ...over }) as WhyNursing;

describe('toExperienceCandidates', () => {
  it('normalises all three sources into a unified candidate shape, carrying visibility', () => {
    const out = toExperienceCandidates(
      [activity({ description: 'helped patients', visibility: 'private' })],
      [clinical({ duties: ['vitals', 'charting'], reflection: 'learned a lot' })],
      [why({ content: 'the spark' })],
    );
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ source: 'activity', id: 'a1', title: 'Hospital volunteer', visibility: 'private' });
    expect(out[0]?.text).toContain('helped patients');
    expect(out[1]).toMatchObject({ source: 'clinical', id: 'c1', visibility: 'family' });
    expect(out[1]?.text).toContain('vitals');
    expect(out[2]).toMatchObject({ source: 'why-nursing', id: 'w1', title: 'A moment' });
  });

  it('defaults missing visibility to family', () => {
    const out = toExperienceCandidates([activity({ visibility: undefined as unknown as Activity['visibility'] })], [], []);
    expect(out[0]?.visibility).toBe('family');
  });
});

describe('candidateKey', () => {
  it('joins source and id', () => {
    expect(candidateKey({ source: 'activity', id: 'a1' })).toBe('activity:a1');
  });
});
