import { describe, expect, it } from 'vitest';
import { parseTargetWords } from './words.js';

describe('parseTargetWords', () => {
  it('reads explicit counts in common phrasings', () => {
    expect(parseTargetWords('Tell us why, in 500 words or fewer.')).toBe(500);
    expect(parseTargetWords('Write a 300-word response.')).toBe(300);
    expect(parseTargetWords('No more than 650 words.')).toBe(650);
    expect(parseTargetWords('Your essay (250 words max) should…')).toBe(250);
  });

  it('takes the upper bound of a range and the largest of multiple mentions', () => {
    expect(parseTargetWords('Between 250-650 words.')).toBe(650);
    expect(parseTargetWords('250 to 650 words, ideally.')).toBe(650);
    expect(parseTargetWords('Part A: 150 words. Part B: 400 words.')).toBe(400);
  });

  it('ignores noise and silent prompts', () => {
    expect(parseTargetWords('List 3 words that describe you.')).toBeUndefined();
    expect(parseTargetWords('Why nursing?')).toBeUndefined();
    expect(parseTargetWords(undefined)).toBeUndefined();
    expect(parseTargetWords('Write 9000 words about your life.')).toBeUndefined();
  });
});
