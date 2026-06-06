import { describe, expect, it } from 'vitest';
import type { College } from '../../shared/data/index.js';
import {
  clusterByRegion,
  curatedTripPlan,
  makeBedrockTripPlanner,
  regionOf,
  type BedrockInvoker,
} from './tripplan.js';

const college = (over: Partial<College> = {}): College => ({
  collegeId: Math.random().toString(36).slice(2),
  name: 'College',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('regionOf', () => {
  it('prefers explicit state', () => {
    expect(regionOf(college({ state: 'IA', location: 'Iowa City, Iowa' }))).toBe('IA');
  });
  it('falls back to the last segment of location', () => {
    expect(regionOf(college({ location: 'Ann Arbor, Michigan' }))).toBe('Michigan');
  });
  it('returns Other when nothing is known', () => {
    expect(regionOf(college({}))).toBe('Other');
  });
});

describe('clusterByRegion', () => {
  it('groups by region, largest cluster first', () => {
    const clusters = clusterByRegion([
      college({ name: 'A', state: 'IA' }),
      college({ name: 'B', state: 'MI' }),
      college({ name: 'C', state: 'IA' }),
    ]);
    expect(clusters[0]!.region).toBe('IA');
    expect(clusters[0]!.colleges.map((c) => c.name).sort()).toEqual(['A', 'C']);
    expect(clusters[1]!.region).toBe('MI');
  });

  it('writes a multi-school itinerary line for clusters > 1', () => {
    const [cluster] = clusterByRegion([college({ name: 'A', state: 'IA' }), college({ name: 'B', state: 'IA' })]);
    expect(cluster!.itinerary).toMatch(/group these 2 IA schools/i);
  });

  it('caps the number of clusters when maxClusters is given', () => {
    const clusters = clusterByRegion(
      [college({ state: 'IA' }), college({ state: 'MI' }), college({ state: 'CA' })],
      2,
    );
    expect(clusters).toHaveLength(2);
  });
});

describe('curatedTripPlan', () => {
  it('returns curated clusters', async () => {
    const plan = await curatedTripPlan([college({ state: 'IA' })]);
    expect(plan.source).toBe('curated');
    expect(plan.clusters).toHaveLength(1);
  });
});

describe('makeBedrockTripPlanner', () => {
  it('falls back to curated when unconfigured', async () => {
    const plan = await makeBedrockTripPlanner({ modelId: undefined })([college({ state: 'IA' })]);
    expect(plan.source).toBe('curated');
  });

  it('returns curated when there are no colleges (no model call)', async () => {
    const plan = await makeBedrockTripPlanner({ modelId: 'm' })([]);
    expect(plan.source).toBe('curated');
    expect(plan.clusters).toHaveLength(0);
  });

  it('refines itinerary prose from the model but keeps deterministic clustering (source=ai)', async () => {
    const body = { content: [{ text: '[{"region":"IA","itinerary":"Spring-break Iowa loop."}]' }] };
    const client: BedrockInvoker = {
      send: async () => ({ body: new TextEncoder().encode(JSON.stringify(body)) }),
    };
    const plan = await makeBedrockTripPlanner({ modelId: 'm', client })([
      college({ name: 'A', state: 'IA' }),
      college({ name: 'B', state: 'IA' }),
    ]);
    expect(plan.source).toBe('ai');
    expect(plan.clusters[0]!.itinerary).toBe('Spring-break Iowa loop.');
    expect(plan.clusters[0]!.colleges).toHaveLength(2);
  });

  it('falls back to curated when the model throws', async () => {
    const client: BedrockInvoker = { send: async () => { throw new Error('boom'); } };
    const plan = await makeBedrockTripPlanner({ modelId: 'm', client })([college({ state: 'IA' })]);
    expect(plan.source).toBe('curated');
  });
});
