import { describe, expect, it } from 'vitest';
import { gradYearGuide, parseTurn } from './ai.js';

describe('gradYearGuide (grade → graduation year)', () => {
  it('spring: a sophomore in June 2026 graduates 2028 (the reported bug)', () => {
    const g = gradYearGuide(new Date('2026-06-13T00:00:00Z'));
    expect(g).toContain('12th/senior → 2026');
    expect(g).toContain('10th/sophomore → 2028');
    expect(g).toContain('9th/freshman → 2029');
    expect(g).toContain('2026-06-13');
  });

  it('fall: once the next school year started (Sept), grades roll forward a year', () => {
    const g = gradYearGuide(new Date('2026-09-01T00:00:00Z'));
    expect(g).toContain('12th/senior → 2027');
    expect(g).toContain('10th/sophomore → 2029');
  });
});

describe('parseTurn', () => {
  it('parses a well-formed JSON turn', () => {
    const t = parseTurn('{"reply":"Hi","profile":{"name":"Grahem"},"done":false}');
    expect(t).toMatchObject({ reply: 'Hi', profile: { name: 'Grahem' }, done: false });
  });

  it('degrades to raw text when the model returns no JSON', () => {
    const t = parseTurn('just some prose, no json');
    expect(t.done).toBe(false);
    expect(t.profile).toEqual({});
    expect(t.reply).toContain('prose');
  });
});
