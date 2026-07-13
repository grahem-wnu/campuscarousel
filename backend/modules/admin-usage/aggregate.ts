// Pure usage aggregation — no I/O. Buckets a flat list of usage rows by one dimension
// (feature/student/model/day), summing cost + tokens per bucket and overall. Buckets are
// sorted by cost descending so the biggest spenders surface first.

export interface UsageRow {
  feature: string;
  model: string;
  studentId?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
  occurredAt: string; // iso8601
}

export type GroupBy = 'feature' | 'student' | 'model' | 'day';

export interface UsageBucket {
  key: string;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface UsageAggregate {
  totalCostMicros: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  buckets: UsageBucket[];
}

function bucketKey(row: UsageRow, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'feature':
      return row.feature;
    case 'model':
      return row.model;
    case 'student':
      return row.studentId ?? '(none)';
    case 'day':
      return row.occurredAt.slice(0, 10);
  }
}

export function aggregate(rows: UsageRow[], groupBy: GroupBy): UsageAggregate {
  let totalCostMicros = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const byKey = new Map<string, UsageBucket>();

  for (const row of rows) {
    totalCostMicros += row.costMicros;
    totalInputTokens += row.inputTokens;
    totalOutputTokens += row.outputTokens;

    const key = bucketKey(row, groupBy);
    const bucket = byKey.get(key) ?? { key, costMicros: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
    bucket.costMicros += row.costMicros;
    bucket.inputTokens += row.inputTokens;
    bucket.outputTokens += row.outputTokens;
    bucket.calls += 1;
    byKey.set(key, bucket);
  }

  const buckets = [...byKey.values()].sort((a, b) => b.costMicros - a.costMicros);
  return { totalCostMicros, totalInputTokens, totalOutputTokens, buckets };
}
