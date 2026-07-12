import { describe, expect, it } from 'vitest';
import { aggregate, type UsageRow } from './aggregate.js';

const rows: UsageRow[] = [
  { feature: 'focus', model: 'anthropic.claude-sonnet-4', studentId: 'a', inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 100, occurredAt: '2026-07-01T00:00:00Z' },
  { feature: 'focus', model: 'anthropic.claude-sonnet-4', studentId: 'b', inputTokens: 20, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 250, occurredAt: '2026-07-02T00:00:00Z' },
  { feature: 'exam-prep', model: 'anthropic.claude-sonnet-4', studentId: 'a', inputTokens: 8, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 40, occurredAt: '2026-07-02T00:00:00Z' },
];

describe('aggregate', () => {
  it('totals cost + tokens and buckets by the chosen dimension', () => {
    const out = aggregate(rows, 'feature');
    expect(out.totalCostMicros).toBe(390);
    expect(out.buckets).toEqual([
      { key: 'focus', costMicros: 350, inputTokens: 30, outputTokens: 10, calls: 2 },
      { key: 'exam-prep', costMicros: 40, inputTokens: 8, outputTokens: 2, calls: 1 },
    ]); // sorted by costMicros desc
  });

  it('buckets by day and by student', () => {
    expect(aggregate(rows, 'day').buckets.map((b) => b.key)).toEqual(['2026-07-02', '2026-07-01']);
    expect(aggregate(rows, 'student').buckets.map((b) => b.key).sort()).toEqual(['a', 'b']);
  });
});
