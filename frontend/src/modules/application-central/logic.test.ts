import { describe, expect, it } from 'vitest';
import { draftsNewestFirst, latestDraft, wordCount, wordCountTone } from './logic';
import type { Draft } from './types';

const d = (version: number): Draft => ({ version, content: `draft ${version}`, createdAt: 'x' });

describe('wordCount', () => {
  it('counts whitespace tokens', () => {
    expect(wordCount('one two three')).toBe(3);
    expect(wordCount('  ')).toBe(0);
  });
});

describe('latestDraft / draftsNewestFirst', () => {
  it('latestDraft picks the highest version', () => {
    expect(latestDraft([d(1), d(3), d(2)])?.version).toBe(3);
    expect(latestDraft([])).toBeNull();
  });
  it('draftsNewestFirst sorts descending without mutating', () => {
    const arr = [d(1), d(2)];
    expect(draftsNewestFirst(arr).map((x) => x.version)).toEqual([2, 1]);
    expect(arr.map((x) => x.version)).toEqual([1, 2]); // original untouched
  });
});

describe('wordCountTone', () => {
  it('neutral when no target', () => {
    expect(wordCountTone(500, null)).toBe('neutral');
  });
  it('success near/at target', () => {
    expect(wordCountTone(640, 650)).toBe('success'); // within 10% under
    expect(wordCountTone(650, 650)).toBe('success');
    expect(wordCountTone(660, 650)).toBe('success'); // tiny over
  });
  it('warn moderately under', () => {
    expect(wordCountTone(520, 650)).toBe('warn'); // ~80%
  });
  it('error well over target', () => {
    expect(wordCountTone(800, 650)).toBe('error');
  });
  it('neutral far under', () => {
    expect(wordCountTone(100, 650)).toBe('neutral');
  });
});
