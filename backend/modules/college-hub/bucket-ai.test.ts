import { beforeEach, describe, it, expect } from 'vitest';
import { InMemoryTableClient, makeData, type College, type Data } from '../../shared/data/index.js';
import { runWithStudent, runWithTenant } from '../../shared/tenant/index.js';
import {
  parseBucketSuggestion,
  buildBucketPrompt,
  suggestBucket,
  makeBucketWorkerHandler,
  makeSqsBucketEnqueuer,
  runBucketJob,
  type BucketSuggester,
  type SqsSender,
} from './bucket-ai.js';

describe('parseBucketSuggestion', () => {
  it('parses a valid suggestion', () => {
    expect(parseBucketSuggestion('{"bucket":"reach","rationale":"12% accept","confidence":"high"}'))
      .toEqual({ bucket: 'reach', rationale: '12% accept', confidence: 'high' });
  });
  it('extracts JSON embedded in prose', () => {
    expect(parseBucketSuggestion('Here: {"bucket":"safety","rationale":"70% accept","confidence":"high"} ok')?.bucket)
      .toBe('safety');
  });
  it('returns undefined on a bad bucket value', () => {
    expect(parseBucketSuggestion('{"bucket":"maybe","rationale":"x","confidence":"low"}')).toBeUndefined();
  });
  it('returns undefined on a bad confidence value', () => {
    expect(parseBucketSuggestion('{"bucket":"reach","rationale":"x","confidence":"certain"}')).toBeUndefined();
  });
  it('returns undefined on empty rationale', () => {
    expect(parseBucketSuggestion('{"bucket":"reach","rationale":"","confidence":"low"}')).toBeUndefined();
  });
  it('returns undefined on non-JSON', () => {
    expect(parseBucketSuggestion('the answer is reach')).toBeUndefined();
  });
});

describe('buildBucketPrompt', () => {
  it('notes when GPA is on file', () => {
    const p = buildBucketPrompt({ college: { name: 'U', acceptanceRateProgram: '12%' } as any, currentGPA: 3.6, gpaType: 'unweighted' });
    expect(p).toContain('3.6');
    expect(p).toContain('reach');
  });
  it('flags low confidence when GPA is absent', () => {
    const p = buildBucketPrompt({ college: { name: 'U', acceptanceRateProgram: '12%' } as any });
    expect(p.toLowerCase()).toContain('not on file');
  });
});

describe('suggestBucket', () => {
  it('short-circuits to undefined with nothing to reason from', async () => {
    expect(await suggestBucket({ college: { name: 'X' } as any })).toBeUndefined(); // returns before any model call
  });
});

describe('async bucket job (worker + enqueuer)', () => {
  let data: Data;
  const getData = () => data;
  beforeEach(() => {
    data = makeData(new InMemoryTableClient());
  });

  const SUGGESTION = { bucket: 'reach' as const, rationale: '12% accept rate', confidence: 'high' as const };
  const newCollege = (over: Partial<College> = {}) =>
    data.colleges.create({ name: 'Arizona State University', acceptanceRateProgram: '12%', ...over } as Parameters<Data['colleges']['create']>[0]);

  it('runs the suggester and merges suggestedBucket* for a task:bucket message', async () => {
    const suggester: BucketSuggester = async () => SUGGESTION;
    const handler = makeBucketWorkerHandler(getData, suggester);
    await runWithTenant('t1', () =>
      runWithStudent('s1', async () => {
        const c = await newCollege();
        await handler({ type: 'college-hydrate', task: 'bucket', collegeId: c.collegeId });
        const after = await data.colleges.get(c.collegeId);
        expect(after?.suggestedBucket).toBe('reach');
        expect(after?.suggestedBucketRationale).toBe('12% accept rate');
        expect(after?.suggestedBucketConfidence).toBe('high');
        // The suggester writes only system fields, never the user override.
        expect(after?.bucket).toBeUndefined();
      }),
    );
  });

  it('is a no-op for a non-bucket task', async () => {
    let called = false;
    const suggester: BucketSuggester = async () => {
      called = true;
      return SUGGESTION;
    };
    const handler = makeBucketWorkerHandler(getData, suggester);
    await runWithTenant('t1', () =>
      runWithStudent('s1', async () => {
        const c = await newCollege();
        await handler({ type: 'college-hydrate', task: 'prep', collegeId: c.collegeId });
        expect(called).toBe(false);
        expect((await data.colleges.get(c.collegeId))?.suggestedBucket).toBeUndefined();
      }),
    );
  });

  it('is a no-op when the college is gone', async () => {
    let called = false;
    const suggester: BucketSuggester = async () => {
      called = true;
      return SUGGESTION;
    };
    await runWithTenant('t1', () =>
      runWithStudent('s1', async () => {
        await runBucketJob(getData, suggester, 'nope-does-not-exist');
        expect(called).toBe(false);
      }),
    );
  });

  it('preserves a family override (bucket + userEdited) while refreshing the suggestion', async () => {
    const suggester: BucketSuggester = async () => ({ bucket: 'target', rationale: 'near profile', confidence: 'medium' });
    await runWithTenant('t1', () =>
      runWithStudent('s1', async () => {
        const c = await newCollege();
        // Family sets an explicit override (a user field).
        await data.colleges.update(c.collegeId, { bucket: 'safety' });
        await runBucketJob(getData, suggester, c.collegeId);
        const after = await data.colleges.get(c.collegeId);
        expect(after?.bucket).toBe('safety'); // override survives
        expect(after?.suggestedBucket).toBe('target'); // suggestion still refreshes
      }),
    );
  });

  it('never throws when the suggester throws', async () => {
    const throwing: BucketSuggester = async () => {
      throw new Error('boom');
    };
    await runWithTenant('t1', () =>
      runWithStudent('s1', async () => {
        const c = await newCollege();
        await expect(runBucketJob(getData, throwing, c.collegeId)).resolves.toBeUndefined();
        expect((await data.colleges.get(c.collegeId))?.suggestedBucket).toBeUndefined();
      }),
    );
  });

  it('makeSqsBucketEnqueuer sends a task:bucket message with tenant + student', async () => {
    let captured: { input?: { QueueUrl?: string; MessageBody?: string } } | undefined;
    const client: SqsSender = {
      send: async (cmd) => {
        captured = cmd as { input?: { QueueUrl?: string; MessageBody?: string } };
        return {};
      },
    };
    const enqueue = makeSqsBucketEnqueuer(getData, { queueUrl: 'https://sqs.test/q', client });
    await runWithTenant('fam1', () => runWithStudent('s1', () => enqueue('college-9')));
    expect(captured?.input?.QueueUrl).toBe('https://sqs.test/q');
    expect(JSON.parse(captured?.input?.MessageBody ?? '{}')).toEqual({
      type: 'college-hydrate',
      collegeId: 'college-9',
      task: 'bucket',
      tenantId: 'fam1',
      studentId: 's1',
    });
  });
});
