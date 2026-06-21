import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { runWithStudent, runWithTenant } from '../../shared/tenant/index.js';
import {
  buildGuidancePrompt,
  parseGuidance,
  researchGuidanceJob,
  type CertGuidanceResearcher,
} from './guidance.js';
import { makeSqsGuidanceEnqueuer, type SqsSender } from './enqueue.js';

const ok: CertGuidanceResearcher = async ({ certName, location }) => ({
  officialUrl: 'https://cpr.heart.org',
  howToGet: `Take a ${certName} course.`,
  typicalCost: 90,
  renewalFrequency: 'Every 2 years',
  localProviders: location ? [{ name: 'Local Red Cross', detail: location, url: 'https://redcross.org' }] : [],
});

const boom: CertGuidanceResearcher = () => Promise.reject(new Error('web search unavailable'));

let data: Data;
const getData = () => data;
beforeEach(() => {
  data = makeData(new InMemoryTableClient());
});

describe('parseGuidance', () => {
  it('extracts a JSON object from prose/fences and coerces fields', () => {
    const text = 'Here you go:\n```json\n{"officialUrl":"https://x.org","howToGet":"Do it.","typicalCost":90,"localProviders":[{"name":"A","url":"https://a.org"},{"bad":1}]}\n```';
    const g = parseGuidance(text);
    expect(g.officialUrl).toBe('https://x.org');
    expect(g.howToGet).toBe('Do it.');
    expect(g.typicalCost).toBe(90);
    expect(g.localProviders).toEqual([{ name: 'A', detail: undefined, url: 'https://a.org' }]);
  });

  it('drops non-http urls and returns {} on no JSON', () => {
    expect(parseGuidance('no json here')).toEqual({});
    const g = parseGuidance('{"officialUrl":"javascript:alert(1)","howToGet":"x"}');
    expect(g.officialUrl).toBeUndefined();
    expect(g.howToGet).toBe('x');
  });
});

describe('buildGuidancePrompt', () => {
  it('localizes when a location is supplied', () => {
    expect(buildGuidancePrompt('CNA', 'Aliso Viejo, CA')).toContain('Aliso Viejo, CA');
    expect(buildGuidancePrompt('CNA')).toContain('national providers');
  });
});

describe('researchGuidanceJob', () => {
  it('researches and marks the job complete with the result', async () => {
    const job = await data.certGuidanceJobs.create({ certName: 'BLS/CPR', location: 'Irvine, CA', status: 'pending' });
    await researchGuidanceJob(getData, ok, job.jobId);
    const after = await data.certGuidanceJobs.get(job.jobId);
    expect(after?.status).toBe('complete');
    expect(after?.result?.officialUrl).toBe('https://cpr.heart.org');
    expect(after?.result?.localProviders?.[0]?.detail).toBe('Irvine, CA');
  });

  it('marks the job failed when the researcher throws', async () => {
    const job = await data.certGuidanceJobs.create({ certName: 'CNA', status: 'pending' });
    await researchGuidanceJob(getData, boom, job.jobId);
    const after = await data.certGuidanceJobs.get(job.jobId);
    expect(after?.status).toBe('failed');
    expect(after?.error).toContain('web search');
  });

  it('is a no-op when the job is gone', async () => {
    await expect(researchGuidanceJob(getData, ok, 'missing')).resolves.toBeUndefined();
  });
});

describe('makeSqsGuidanceEnqueuer', () => {
  it('sends a cert-guidance message with the tenant/student', async () => {
    let captured: { input?: { QueueUrl?: string; MessageBody?: string } } | undefined;
    const client: SqsSender = {
      send: async (cmd) => {
        captured = cmd as { input?: { QueueUrl?: string; MessageBody?: string } };
        return {};
      },
    };
    const enqueue = makeSqsGuidanceEnqueuer(getData, ok, { queueUrl: 'https://sqs.test/q', client });
    await runWithTenant('fam1', () => runWithStudent('s1', () => enqueue('job-7')));
    expect(captured?.input?.QueueUrl).toBe('https://sqs.test/q');
    expect(JSON.parse(captured?.input?.MessageBody ?? '{}')).toEqual({
      type: 'cert-guidance',
      jobId: 'job-7',
      tenantId: 'fam1',
      studentId: 's1',
    });
  });

  it('falls back to inline research when no queue url is configured', async () => {
    const prev = process.env.HYDRATION_QUEUE_URL;
    delete process.env.HYDRATION_QUEUE_URL;
    try {
      const job = await data.certGuidanceJobs.create({ certName: 'BLS', status: 'pending' });
      const enqueue = makeSqsGuidanceEnqueuer(getData, ok);
      await enqueue(job.jobId);
      expect((await data.certGuidanceJobs.get(job.jobId))?.status).toBe('complete');
    } finally {
      if (prev !== undefined) process.env.HYDRATION_QUEUE_URL = prev;
    }
  });
});
