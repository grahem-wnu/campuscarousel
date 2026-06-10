import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Discoverer } from './ai.js';
import { makeDiscoverWorkerHandler, makeSqsDiscoverEnqueuer, runDiscoveryJob } from './discover.js';

const stub: Discoverer = async () => [{ name: 'X', type: 'shadowing' }];
let data: Data;
beforeEach(() => {
  data = makeData(new InMemoryTableClient());
});

describe('runDiscoveryJob', () => {
  it('marks the job complete with candidates', async () => {
    const job = await data.opportunityDiscoveryJobs.create({ status: 'pending', filters: {} });
    await runDiscoveryJob(() => data, stub, job.jobId);
    const after = await data.opportunityDiscoveryJobs.get(job.jobId);
    expect(after?.status).toBe('complete');
    expect(after?.count).toBe(1);
  });
  it('marks the job failed when the discoverer throws', async () => {
    const job = await data.opportunityDiscoveryJobs.create({ status: 'pending', filters: {} });
    await runDiscoveryJob(
      () => data,
      async () => {
        throw new Error('boom');
      },
      job.jobId,
    );
    expect((await data.opportunityDiscoveryJobs.get(job.jobId))?.status).toBe('failed');
  });
});

describe('makeSqsDiscoverEnqueuer', () => {
  it('falls back to inline when no queue url is configured', async () => {
    const prev = process.env.HYDRATION_QUEUE_URL;
    delete process.env.HYDRATION_QUEUE_URL;
    try {
      const ran: string[] = [];
      const enqueue = makeSqsDiscoverEnqueuer(() => data, { fallback: async (id) => void ran.push(id) });
      await enqueue('j1');
      expect(ran).toEqual(['j1']);
    } finally {
      if (prev !== undefined) process.env.HYDRATION_QUEUE_URL = prev;
    }
  });
});

describe('makeDiscoverWorkerHandler', () => {
  it('ignores a payload without a jobId', async () => {
    const handler = makeDiscoverWorkerHandler(() => data, stub);
    await handler({});
    expect(await data.opportunities.list()).toHaveLength(0);
  });
});
