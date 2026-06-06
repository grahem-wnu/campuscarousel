import { describe, expect, it, vi } from 'vitest';
import { buildSuggestPrompt, makeSuggester, parseSuggestions, unavailableSuggester } from './suggester.js';

describe('buildSuggestPrompt', () => {
  it('weaves in the profile context and the default count', () => {
    const p = buildSuggestPrompt({ gradeLevel: 'junior', careerGoal: 'pediatric nurse' });
    expect(p).toContain('Suggest 6');
    expect(p).toContain('Grade level: junior.');
    expect(p).toContain('Career goal: pediatric nurse.');
    expect(p).toContain('academic, clinical, extracurricular, test-prep, application, personal');
  });

  it('honours an explicit count and lists activities + colleges', () => {
    const p = buildSuggestPrompt({
      count: 3,
      currentActivities: ['hospital volunteer', 'HOSA'],
      targetColleges: ['Ohio State'],
    });
    expect(p).toContain('Suggest 3');
    expect(p).toContain('Current activities: hospital volunteer, HOSA.');
    expect(p).toContain('Target colleges: Ohio State.');
  });
});

describe('parseSuggestions', () => {
  it('extracts a JSON array embedded in prose', () => {
    const raw = 'Sure! Here are goals:\n[{"title":"Shadow a nurse","category":"clinical"}]\nHope that helps.';
    const out = parseSuggestions(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'Shadow a nurse', category: 'clinical' });
  });

  it('drops entries without a usable title and unknown categories', () => {
    const raw = JSON.stringify([
      { title: '', category: 'clinical' },
      { description: 'no title' },
      { title: 'Good one', category: 'not-a-category', milestones: ['a', '', 2] },
    ]);
    const out = parseSuggestions(raw);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('Good one');
    expect(out[0]?.category).toBeUndefined();
    expect(out[0]?.milestones).toEqual(['a']);
  });

  it('returns [] on unparseable output rather than throwing', () => {
    expect(parseSuggestions('the model said no')).toEqual([]);
    expect(parseSuggestions('[not json]')).toEqual([]);
    expect(parseSuggestions('{"title":"object not array"}')).toEqual([]);
  });

  it('respects the limit', () => {
    const raw = JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ title: `g${i}` })));
    expect(parseSuggestions(raw, 5)).toHaveLength(5);
  });
});

describe('makeSuggester', () => {
  it('builds the prompt, invokes, and parses the model output', async () => {
    const invoke = vi.fn(async (prompt: string) => {
      expect(prompt).toContain('Suggest 2'); // count threaded into the prompt
      return '[{"title":"Shadow a nurse","category":"clinical"}]';
    });
    const out = await makeSuggester(invoke).suggest({ count: 2 });
    expect(out).toEqual([{ title: 'Shadow a nurse', category: 'clinical' }]);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('falls back to [] when the model invocation throws (no 500)', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('Bedrock throttled');
    });
    await expect(makeSuggester(invoke).suggest({})).resolves.toEqual([]);
  });

  it('honours the requested count as the parse limit', async () => {
    const many = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ title: `g${i}` })));
    const out = await makeSuggester(async () => many).suggest({ count: 3 });
    expect(out).toHaveLength(3);
  });
});

describe('unavailableSuggester', () => {
  it('rejects with a 503 when Bedrock is not configured', async () => {
    await expect(unavailableSuggester.suggest({})).rejects.toMatchObject({ status: 503 });
  });
});
