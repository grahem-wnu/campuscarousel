import { describe, expect, it } from 'vitest';
import { buildDiscoverPrompt, parseDiscoverResults, unavailableDiscoverer } from './discover.js';

describe('buildDiscoverPrompt', () => {
  it('instructs web search, a real-only constraint, and weaves in context', () => {
    const p = buildDiscoverPrompt({ query: 'nursing', state: 'Ohio', count: 5, type: 'nursing-specific' });
    expect(p).toContain('web search');
    expect(p).toContain('Do not invent');
    expect(p).toContain('find 5');
    expect(p).toContain('Focus: nursing.');
    expect(p).toContain('Ohio state-specific');
    expect(p).toContain('Prefer type: nursing-specific.');
  });
});

describe('parseDiscoverResults', () => {
  it('extracts a JSON array embedded in prose and keeps clean fields', () => {
    const raw =
      'Here are some:\n[{"name":"Future Nurses Grant","provider":"ANA","amount":5000,"type":"nursing-specific",' +
      '"applicationDeadline":"2026-12-01","applicationUrl":"https://x.org/apply","eligibility":["GPA 3.0"]}]\nGood luck!';
    const out = parseDiscoverResults(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: 'Future Nurses Grant',
      provider: 'ANA',
      amount: 5000,
      type: 'nursing-specific',
      applicationDeadline: '2026-12-01',
      applicationUrl: 'https://x.org/apply',
      eligibility: ['GPA 3.0'],
    });
  });

  it('drops entries without a name and bad shapes (unknown type, non-iso date, non-http url, negative amount)', () => {
    const raw = JSON.stringify([
      { provider: 'no name' },
      {
        name: 'Loose',
        type: 'not-a-type',
        applicationDeadline: 'Dec 2026',
        applicationUrl: 'ftp://nope',
        amount: -10,
      },
    ]);
    const out = parseDiscoverResults(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ name: 'Loose' });
  });

  it('returns [] on unparseable output and respects the limit', () => {
    expect(parseDiscoverResults('no json here')).toEqual([]);
    expect(parseDiscoverResults('{"name":"object not array"}')).toEqual([]);
    const many = JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ name: `s${i}` })));
    expect(parseDiscoverResults(many, 5)).toHaveLength(5);
  });
});

describe('unavailableDiscoverer', () => {
  it('rejects with a 503 until the async discovery infra lands', async () => {
    await expect(unavailableDiscoverer.discover({})).rejects.toMatchObject({ status: 503 });
  });
});
