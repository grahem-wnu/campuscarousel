import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { runWithStudent, runWithTenant } from '../../shared/tenant/index.js';
import { makeSqsEnqueuer, type SqsSender } from './enqueue.js';

let data: Data;
const getData = () => data;
beforeEach(() => {
  data = makeData(new InMemoryTableClient());
});

describe('makeSqsEnqueuer', () => {
  it('sends a college-hydrate message to the queue', async () => {
    let captured: { input?: { QueueUrl?: string; MessageBody?: string } } | undefined;
    const client: SqsSender = {
      send: async (cmd) => {
        captured = cmd as { input?: { QueueUrl?: string; MessageBody?: string } };
        return {};
      },
    };
    const enqueue = makeSqsEnqueuer(getData, { queueUrl: 'https://sqs.test/q', client });
    await runWithTenant('fam1', () => runWithStudent('s1', () => enqueue('college-123')));
    expect(captured?.input?.QueueUrl).toBe('https://sqs.test/q');
    expect(JSON.parse(captured?.input?.MessageBody ?? '{}')).toEqual({
      type: 'college-hydrate',
      collegeId: 'college-123',
      tenantId: 'fam1',
      studentId: 's1',
    });
  });

  it('falls back to the inline dispatcher when no queue url is configured', async () => {
    const prev = process.env.HYDRATION_QUEUE_URL;
    delete process.env.HYDRATION_QUEUE_URL;
    try {
      const fellBack: string[] = [];
      const enqueue = makeSqsEnqueuer(getData, { fallback: async (id) => void fellBack.push(id) });
      await enqueue('c1');
      expect(fellBack).toEqual(['c1']);
    } finally {
      if (prev !== undefined) process.env.HYDRATION_QUEUE_URL = prev;
    }
  });

  it('falls back to the inline dispatcher when the send throws', async () => {
    const throwing: SqsSender = {
      send: async () => {
        throw new Error('AccessDenied');
      },
    };
    const fellBack: string[] = [];
    const enqueue = makeSqsEnqueuer(getData, {
      queueUrl: 'https://sqs.test/q',
      client: throwing,
      fallback: async (id) => void fellBack.push(id),
    });
    await enqueue('c2');
    expect(fellBack).toEqual(['c2']);
  });
});
