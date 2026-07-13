import { describe, it, expect } from 'vitest';
import { parseBucketSuggestion, buildBucketPrompt, suggestBucket } from './bucket-ai.js';

describe('parseBucketSuggestion', () => {
  it('parses a valid suggestion', () => {
    expect(parseBucketSuggestion('{"bucket":"reach","rationale":"12% accept","confidence":"high"}'))
      .toEqual({ bucket: 'reach', rationale: '12% accept', confidence: 'high' });
  });
  it('extracts JSON embedded in prose', () => {
    expect(parseBucketSuggestion('Here: {"bucket":"safety","rationale":"70% accept","confidence":"high"} ok')?.bucket)
      .toBe('safety');
  });
  it('returns undefined on a bad bucket value', () => {
    expect(parseBucketSuggestion('{"bucket":"maybe","rationale":"x","confidence":"low"}')).toBeUndefined();
  });
  it('returns undefined on a bad confidence value', () => {
    expect(parseBucketSuggestion('{"bucket":"reach","rationale":"x","confidence":"certain"}')).toBeUndefined();
  });
  it('returns undefined on empty rationale', () => {
    expect(parseBucketSuggestion('{"bucket":"reach","rationale":"","confidence":"low"}')).toBeUndefined();
  });
  it('returns undefined on non-JSON', () => {
    expect(parseBucketSuggestion('the answer is reach')).toBeUndefined();
  });
});

describe('buildBucketPrompt', () => {
  it('notes when GPA is on file', () => {
    const p = buildBucketPrompt({ college: { name: 'U', acceptanceRateProgram: '12%' } as any, currentGPA: 3.6, gpaType: 'unweighted' });
    expect(p).toContain('3.6');
    expect(p).toContain('reach');
  });
  it('flags low confidence when GPA is absent', () => {
    const p = buildBucketPrompt({ college: { name: 'U', acceptanceRateProgram: '12%' } as any });
    expect(p.toLowerCase()).toContain('not on file');
  });
});

describe('suggestBucket', () => {
  it('short-circuits to undefined with nothing to reason from', async () => {
    expect(await suggestBucket({ college: { name: 'X' } as any })).toBeUndefined(); // returns before any model call
  });
});
