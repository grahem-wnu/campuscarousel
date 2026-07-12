import { describe, expect, it } from 'vitest';
import { gradYearGuide, makeBedrockCollegeSeeder, mergeMustInclude, parseTurn } from './ai.js';

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

  it('captures a valid studentCount', () => {
    const t = parseTurn('{"reply":"Two — got it!","profile":{},"done":false,"studentCount":2}');
    expect(t.studentCount).toBe(2);
  });

  it('omits studentCount when absent', () => {
    const t = parseTurn('{"reply":"Hi","profile":{},"done":false}');
    expect(t.studentCount).toBeUndefined();
  });

  it('drops an out-of-range or non-numeric studentCount', () => {
    expect(parseTurn('{"reply":"x","profile":{},"done":false,"studentCount":0}').studentCount).toBeUndefined();
    expect(parseTurn('{"reply":"x","profile":{},"done":false,"studentCount":99}').studentCount).toBeUndefined();
    expect(parseTurn('{"reply":"x","profile":{},"done":false,"studentCount":"two"}').studentCount).toBeUndefined();
  });
});

describe('mergeMustInclude', () => {
  it('treats the model suggestions as authoritative when it returns any (deduped, in model order)', () => {
    const merged = mergeMustInclude(
      ['Cedarville University', 'Capital University'],
      [
        { name: 'Ohio State University', state: 'OH' },
        { name: 'Capital University', state: 'OH' },
      ],
    );
    // The model's list wins — it already includes the family's picks (canonicalized) per the prompt.
    expect(merged).toEqual([
      { name: 'Ohio State University', state: 'OH' },
      { name: 'Capital University', state: 'OH' },
    ]);
  });

  it('does NOT re-add the family shorthand as a duplicate of the model\'s canonical name', () => {
    // Regression: "USC" (family shorthand) must not survive alongside the model's full name, which is
    // exactly the onboarding bug that seeded "USC" + "University of Southern California" as two colleges.
    const merged = mergeMustInclude(
      ['USC', 'U of Hawaii'],
      [
        { name: 'University of Southern California', state: 'CA' },
        { name: 'University of Hawaii at Manoa', state: 'HI' },
      ],
    );
    expect(merged.map((c) => c.name)).toEqual([
      'University of Southern California',
      'University of Hawaii at Manoa',
    ]);
    expect(merged.some((c) => c.name === 'USC' || c.name === 'U of Hawaii')).toBe(false);
  });

  it('dedupes the model list by normalized name (punctuation-insensitive equality still collapses exact repeats)', () => {
    const merged = mergeMustInclude(
      [],
      [
        { name: 'Duke University', state: 'NC' },
        { name: '  duke university ', state: 'NC' },
      ],
    );
    expect(merged).toEqual([{ name: 'Duke University', state: 'NC' }]);
  });

  it('falls back to the family names (deduped, blanks dropped) only when the model returns nothing', () => {
    const merged = mergeMustInclude(['  Duke University ', 'duke university', ''], []);
    expect(merged).toEqual([{ name: 'Duke University' }]);
  });
});

describe('makeBedrockCollegeSeeder (must-include guarantee)', () => {
  /** A fake Bedrock client that returns one Anthropic-format text response. */
  const invokerReturning = (text: string) => ({
    async invoke(_modelId: string, _body: Uint8Array) {
      return new TextEncoder().encode(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }));
    },
  });
  const failingInvoker = {
    async invoke(): Promise<Uint8Array> {
      throw new Error('bedrock down');
    },
  };

  it('trusts the model list on success and does not re-add family shorthand as a duplicate', async () => {
    // The model is instructed to include every named school by its full name; on a successful call its
    // list is authoritative, so raw family shorthand is not persisted alongside the canonical entry.
    const seeder = makeBedrockCollegeSeeder({
      modelId: 'test-model',
      invoker: invokerReturning('[{"name":"University of Southern California","state":"CA"}]'),
    });
    const list = await seeder(['nursing'], 'Los Angeles, CA', ['USC']);
    expect(list.map((c) => c.name)).toEqual(['University of Southern California']);
  });

  it('returns the named colleges even when the model call fails entirely', async () => {
    const seeder = makeBedrockCollegeSeeder({ modelId: 'test-model', invoker: failingInvoker });
    const list = await seeder(['nursing'], undefined, ['Cedarville University', 'Capital University']);
    expect(list.map((c) => c.name)).toEqual(['Cedarville University', 'Capital University']);
  });

  it('still returns [] on a model failure when nothing was named (existing behavior)', async () => {
    const seeder = makeBedrockCollegeSeeder({ modelId: 'test-model', invoker: failingInvoker });
    expect(await seeder(['nursing'])).toEqual([]);
  });
});
