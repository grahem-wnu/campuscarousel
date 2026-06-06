import { describe, expect, it } from 'vitest';
import { appendDraft, latestDraft, wordCount } from './drafts.js';

describe('wordCount', () => {
  it('counts whitespace-delimited tokens', () => {
    expect(wordCount('hello world')).toBe(2);
    expect(wordCount('  spaced   out \n words ')).toBe(3);
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
  });
});

describe('appendDraft', () => {
  it('appends a version-1 draft with wordCount + createdAt', () => {
    const out = appendDraft(undefined, 'first draft here', '2026-06-06T00:00:00Z');
    expect(out).toEqual([{ version: 1, content: 'first draft here', wordCount: 3, createdAt: '2026-06-06T00:00:00Z' }]);
  });

  it('increments the version off the max existing', () => {
    const out = appendDraft([{ version: 1, content: 'a', createdAt: 'x' }, { version: 2, content: 'b', createdAt: 'y' }], 'c', 'z');
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({ version: 3, content: 'c' });
  });
});

describe('latestDraft', () => {
  it('returns the highest-version draft, or null', () => {
    expect(latestDraft(undefined)).toBeNull();
    expect(latestDraft([])).toBeNull();
    expect(
      latestDraft([{ version: 2, content: 'newer', createdAt: 'y' }, { version: 1, content: 'older', createdAt: 'x' }])?.content,
    ).toBe('newer');
  });
});
