import { describe, expect, it } from 'vitest';
import { gradYearGuide, parseTurn } from './ai.js';

describe('gradYearGuide (grade → graduation year)', () => {
  it('summer: in June 2026 a stated 10th grade = rising sophomore → graduates 2029', () => {
    const g = gradYearGuide(new Date('2026-06-13T00:00:00Z'));
    expect(g).toContain('12th/senior → 2027');
    expect(g).toContain('10th/sophomore → 2029');
    expect(g).toContain('9th/freshman → 2030');
    expect(g).toContain('2026-06-13');
  });

  it('fall (Sept) uses the same upcoming-grade basis', () => {
    const g = gradYearGuide(new Date('2026-09-01T00:00:00Z'));
    expect(g).toContain('12th/senior → 2027');
    expect(g).toContain('10th/sophomore → 2029');
  });

  it('spring (during the school year) treats the grade as current', () => {
    const g = gradYearGuide(new Date('2026-03-01T00:00:00Z'));
    expect(g).toContain('12th/senior → 2026');
    expect(g).toContain('10th/sophomore → 2028');
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
