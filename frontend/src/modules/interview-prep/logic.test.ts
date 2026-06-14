import { describe, expect, it } from 'vitest';
import { answeredQuestions, appendDictation, historyStats, mockProgress, ratingTone } from './logic';
import type { Interview } from './types';

describe('appendDictation', () => {
  it('joins a dictated phrase to existing text with a single space', () => {
    expect(appendDictation('I shadowed a nurse', 'in the ICU')).toBe('I shadowed a nurse in the ICU');
  });
  it('does not lead with a space on an empty field', () => {
    expect(appendDictation('', 'My answer')).toBe('My answer');
  });
  it('collapses trailing whitespace before joining and trims the addition', () => {
    expect(appendDictation('Hello   ', '  world  ')).toBe('Hello world');
  });
  it('ignores an empty/whitespace-only addition', () => {
    expect(appendDictation('unchanged', '   ')).toBe('unchanged');
  });
});

let n = 0;
function session(over: Partial<Interview> = {}): Interview {
  n += 1;
  return {
    sessionId: `s${n}`,
    type: 'mock-practice',
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('ratingTone', () => {
  it('maps ratings to tones', () => {
    expect(ratingTone(5)).toBe('success');
    expect(ratingTone(3)).toBe('warn');
    expect(ratingTone(2)).toBe('error');
    expect(ratingTone(undefined)).toBe('neutral');
  });
});

describe('answeredQuestions / mockProgress', () => {
  const s = session({
    questions: [
      { question: 'Q1', answer: 'a', rating: 4 },
      { question: 'Q2' },
      { question: 'Q3', answer: 'c', rating: 2 },
    ],
  });
  it('counts only rated questions', () => {
    expect(answeredQuestions(s)).toHaveLength(2);
    expect(mockProgress(s)).toEqual({ answered: 2, total: 3 });
  });
});

describe('historyStats', () => {
  it('aggregates averages, per-session trend, and strongest/weakest', () => {
    const sessions: Interview[] = [
      session({ date: '2026-01-01', questions: [{ question: 'A', rating: 2 }, { question: 'B', rating: 4 }] }),
      session({ date: '2026-02-01', questions: [{ question: 'C', rating: 5 }, { question: 'D', rating: 3 }] }),
      session({ type: 'real-interview', date: '2026-03-01', questions: [{ question: 'E', rating: 1 }] }), // excluded (not mock)
    ];
    const h = historyStats(sessions);
    expect(h.sessions).toBe(2);
    expect(h.answered).toBe(4);
    expect(h.avgRating).toBe(3.5);
    expect(h.trend).toEqual([
      { date: '2026-01-01', avg: 3 },
      { date: '2026-02-01', avg: 4 },
    ]);
    expect(h.strongest).toEqual({ question: 'C', rating: 5 });
    expect(h.weakest).toEqual({ question: 'A', rating: 2 });
  });

  it('handles no sessions', () => {
    expect(historyStats([])).toMatchObject({ sessions: 0, answered: 0, avgRating: null, strongest: null });
  });
});
