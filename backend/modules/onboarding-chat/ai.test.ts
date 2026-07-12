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
  it('puts the named colleges first, in the family order, then the model suggestions', () => {
    const merged = mergeMustInclude(
      ['Cedarville University', 'Capital University'],
      [
        { name: 'Ohio State University', state: 'OH' },
        { name: 'Capital University', state: 'OH' },
      ],
    );
    expect(merged.map((c) => c.name)).toEqual(['Cedarville University', 'Capital University', 'Ohio State University']);
    // The named school keeps the model's richer entry (state) when the model also suggested it.
    expect(merged[1]).toEqual({ name: 'Capital University', state: 'OH' });
  });

  it('dedupes named colleges case-insensitively and drops blanks', () => {
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

  it('returns the named colleges even when the model omits them', async () => {
    const seeder = makeBedrockCollegeSeeder({
      modelId: 'test-model',
      invoker: invokerReturning('[{"name":"Ohio State University","state":"OH"}]'),
    });
    const list = await seeder(['nursing'], 'Columbus, Ohio', ['Cedarville University']);
    expect(list.map((c) => c.name)).toEqual(['Cedarville University', 'Ohio State University']);
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
