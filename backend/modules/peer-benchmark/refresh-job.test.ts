import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { runWithStudent, runWithTenant } from '../../shared/tenant/index.js';
import type { BenchmarkResearcher } from './researcher.js';
import {
  makeSqsRefreshEnqueuer,
  runRefreshJob,
  type SqsSender,
} from './refresh-job.js';

const researcher: BenchmarkResearcher = {
  research: async () => ({
    avgGPAAdmitted: 3.8,
    avgTEASScore: 85,
    typicalClinicalHours: 40,
    typicalVolunteerHours: 40,
    typicalCertifications: ['CNA'],
  }),
  analyzeGaps: async () => ({ summary: '', gaps: [] }),
};

const downResearcher: BenchmarkResearcher = {
  research: () => Promise.reject(new Error('web search unavailable')),
  analyzeGaps: () => Promise.reject(new Error('down')),
};

let data: Data;
const getData = () => data;
beforeEach(() => {
  data = makeData(new InMemoryTableClient());
});

async function seedCollege(name = 'UF'): Promise<string> {
  const c = await data.colleges.create({ name } as Parameters<Data['colleges']['create']>[0]);
  return c.collegeId;
}

describe('runRefreshJob', () => {
  it('researches, persists the merged benchmark, and marks the job complete', async () => {
    const collegeId = await seedCollege();
    const job = await data.benchmarkRefreshJobs.create({ collegeId, status: 'pending' });
    await runRefreshJob(getData, researcher, job.jobId);

    const stored = await data.benchmarks.get(collegeId);
    expect(stored?.avgGPAAdmitted).toBe(3.8);
    expect(stored?.typicalCertifications).toEqual(['CNA']);
    expect(stored?.keirasComparison).toBeDefined();
    expect((await data.benchmarkRefreshJobs.get(job.jobId))?.status).toBe('complete');
  });

  it('marks the job failed (no benchmark written) when the college is gone', async () => {
    const job = await data.benchmarkRefreshJobs.create({ collegeId: 'ghost', status: 'pending' });
    await runRefreshJob(getData, researcher, job.jobId);
    const after = await data.benchmarkRefreshJobs.get(job.jobId);
    expect(after?.status).toBe('failed');
    expect(after?.error).toBeTruthy();
    expect(await data.benchmarks.get('ghost')).toBeNull();
  });

  it('marks the job failed when the researcher throws', async () => {
    const collegeId = await seedCollege();
    const job = await data.benchmarkRefreshJobs.create({ collegeId, status: 'pending' });
    await runRefreshJob(getData, downResearcher, job.jobId);
    const after = await data.benchmarkRefreshJobs.get(job.jobId);
    expect(after?.status).toBe('failed');
    expect(after?.error).toContain('web search');
    expect(await data.benchmarks.get(collegeId)).toBeNull();
  });

  it('is a no-op when the job is gone', async () => {
    await expect(runRefreshJob(getData, researcher, 'missing')).resolves.toBeUndefined();
  });

  it('excludes private-entry hours from the PERSISTED comparison (family-visible)', async () => {
    const collegeId = await seedCollege();
    // 100 private clinical hours would put Keira "above" the school's 40; family-visible is 0 → "below".
    await data.experiences.create({ date: '2026-01-01', facility: 'Secret', hours: 100, visibility: 'private' } as Parameters<Data['experiences']['create']>[0]);
    const job = await data.benchmarkRefreshJobs.create({ collegeId, status: 'pending' });
    await runRefreshJob(getData, researcher, job.jobId);
    const stored = await data.benchmarks.get(collegeId);
    expect(stored?.keirasComparison?.clinicalHoursStatus).toBe('below');
  });
});

describe('makeSqsRefreshEnqueuer', () => {
  it('sends a benchmark-refresh message to the queue with the tenant/student', async () => {
    let captured: { input?: { QueueUrl?: string; MessageBody?: string } } | undefined;
    const client: SqsSender = {
      send: async (cmd) => {
        captured = cmd as { input?: { QueueUrl?: string; MessageBody?: string } };
        return {};
      },
    };
    const enqueue = makeSqsRefreshEnqueuer(getData, { queueUrl: 'https://sqs.test/q', client });
    await runWithTenant('fam1', () => runWithStudent('s1', () => enqueue('job-9')));
    expect(captured?.input?.QueueUrl).toBe('https://sqs.test/q');
    expect(JSON.parse(captured?.input?.MessageBody ?? '{}')).toEqual({
      type: 'benchmark-refresh',
      jobId: 'job-9',
      tenantId: 'fam1',
      studentId: 's1',
    });
  });

  it('falls back to the inline dispatcher when no queue url is configured', async () => {
    const prev = process.env.HYDRATION_QUEUE_URL;
    delete process.env.HYDRATION_QUEUE_URL;
    try {
      const fellBack: string[] = [];
      const enqueue = makeSqsRefreshEnqueuer(getData, { fallback: async (id) => void fellBack.push(id) });
      await enqueue('j1');
      expect(fellBack).toEqual(['j1']);
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
    const enqueue = makeSqsRefreshEnqueuer(getData, {
      queueUrl: 'https://sqs.test/q',
      client: throwing,
      fallback: async (id) => void fellBack.push(id),
    });
    await enqueue('j2');
    expect(fellBack).toEqual(['j2']);
  });
});
