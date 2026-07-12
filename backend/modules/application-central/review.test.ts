import { describe, expect, it, vi } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { runWithStudent, runWithTenant } from '../../shared/tenant/index.js';
import { makeSqsReviewEnqueuer, runReviewJob, type SqsSender } from './review.js';
import type { EssayReviewer } from './ai.js';
import type { ExperiencePool } from './grounding.js';

const now = () => new Date('2026-06-06T00:00:00Z');

const curated: EssayReviewer = async ({ content }) => ({
  strengths: ['clear'], improvements: ['tighten'], authenticity: 'you',
  wordCount: content.split(/\s+/).filter(Boolean).length, onTarget: null, rewrote: false, source: 'curated',
});
const rated: EssayReviewer = async ({ content }) => ({
  strengths: ['s'], improvements: ['i'], authenticity: 'a',
  ratings: { promptFit: 8, voice: 9, structure: 7, specificity: 8 },
  overall: 8, verdict: 'close', wordCount: content.split(/\s+/).filter(Boolean).length,
  onTarget: null, rewrote: false, source: 'ai',
});

async function mk(): Promise<Data> { return makeData(new InMemoryTableClient()); }
async function seedEssay(data: Data, over: Record<string, unknown> = {}) {
  return data.essays.create({ prompt: 'Why nursing?', ...over } as Parameters<Data['essays']['create']>[0]);
}

describe('runReviewJob', () => {
  it('marks the job complete with the review result', async () => {
    const data = await mk();
    const essay = await seedEssay(data);
    const job = await data.essayReviewJobs.create({ essayId: essay.essayId, content: 'a draft about nursing', reviewerUsername: 'keira', reviewerRole: 'student', status: 'pending' });
    await runReviewJob(() => data, curated, now, job.jobId);
    const after = await data.essayReviewJobs.get(job.jobId);
    expect(after?.status).toBe('complete');
    expect(after?.result?.rewrote).toBe(false);
    expect(after?.result?.source).toBe('curated');
    // curated (no overall/verdict) → no lastReview persisted
    expect((await data.essays.get(essay.essayId))?.lastReview).toBeUndefined();
  });

  it('persists a compact lastReview from an AI rubric review', async () => {
    const data = await mk();
    const essay = await seedEssay(data);
    const job = await data.essayReviewJobs.create({ essayId: essay.essayId, content: 'my draft words', reviewerUsername: 'keira', reviewerRole: 'student', status: 'pending' });
    await runReviewJob(() => data, rated, now, job.jobId);
    const after = await data.essayReviewJobs.get(job.jobId);
    expect(after?.status).toBe('complete');
    expect(after?.result?.overall).toBe(8);
    expect((await data.essays.get(essay.essayId))?.lastReview).toMatchObject({
      overall: 8, verdict: 'close', reviewedAt: now().toISOString(),
    });
  });

  it('marks the job failed when the reviewer throws', async () => {
    const data = await mk();
    const essay = await seedEssay(data);
    const job = await data.essayReviewJobs.create({ essayId: essay.essayId, content: 'x', reviewerUsername: 'keira', reviewerRole: 'student', status: 'pending' });
    const boom: EssayReviewer = async () => { throw new Error('bedrock down'); };
    await runReviewJob(() => data, boom, now, job.jobId);
    const after = await data.essayReviewJobs.get(job.jobId);
    expect(after?.status).toBe('failed');
    expect(after?.error).toContain('bedrock down');
  });

  it('fails cleanly when the referenced essay is gone', async () => {
    const data = await mk();
    const job = await data.essayReviewJobs.create({ essayId: 'ghost', content: 'x', reviewerUsername: 'keira', reviewerRole: 'student', status: 'pending' });
    await runReviewJob(() => data, curated, now, job.jobId);
    expect((await data.essayReviewJobs.get(job.jobId))?.status).toBe('failed');
  });

  it('no-ops when the job is gone', async () => {
    const data = await mk();
    await expect(runReviewJob(() => data, curated, now, 'nope')).resolves.toBeUndefined();
  });
});

describe('runReviewJob — privacy-filtered experience pool by reviewerRole', () => {
  async function seedExperiences(data: Data) {
    await data.activities.create({ userId: 'keira', date: '2026-01-01', category: 'volunteer', title: 'Family activity', visibility: 'family' } as Parameters<Data['activities']['create']>[0]);
    await data.activities.create({ userId: 'keira', date: '2026-01-02', category: 'personal', title: 'Private moment', visibility: 'private' } as Parameters<Data['activities']['create']>[0]);
  }

  it('passes a pool INCLUDING private entries when the reviewer is the student', async () => {
    const data = await mk();
    await seedExperiences(data);
    const essay = await seedEssay(data);
    const job = await data.essayReviewJobs.create({ essayId: essay.essayId, content: 'a draft', reviewerUsername: 'keira', reviewerRole: 'student', status: 'pending' });
    let seenPool: ExperiencePool | undefined;
    const spy: EssayReviewer = async (input) => { seenPool = input.pool; return curated(input); };
    await runReviewJob(() => data, spy, now, job.jobId);
    expect(seenPool?.includesPrivate).toBe(true);
    expect(seenPool?.counts.activities).toBe(2);
  });

  it('passes a pool WITHOUT private entries when the reviewer is a parent', async () => {
    const data = await mk();
    await seedExperiences(data);
    const essay = await seedEssay(data);
    const job = await data.essayReviewJobs.create({ essayId: essay.essayId, content: 'a draft', reviewerUsername: 'kate', reviewerRole: 'parent', status: 'pending' });
    let seenPool: ExperiencePool | undefined;
    const spy: EssayReviewer = async (input) => { seenPool = input.pool; return curated(input); };
    await runReviewJob(() => data, spy, now, job.jobId);
    expect(seenPool?.includesPrivate).toBe(false);
    expect(seenPool?.counts.activities).toBe(1);
  });
});

describe('makeSqsReviewEnqueuer', () => {
  it('falls back to inline evaluation when no queue is configured', async () => {
    const data = await mk();
    const prevEssayCoach = process.env.ESSAY_COACH_QUEUE_URL;
    const prevFocus = process.env.FOCUS_QUEUE_URL;
    const prevHydration = process.env.HYDRATION_QUEUE_URL;
    delete process.env.ESSAY_COACH_QUEUE_URL;
    delete process.env.FOCUS_QUEUE_URL;
    delete process.env.HYDRATION_QUEUE_URL;
    try {
      const essay = await seedEssay(data);
      const job = await data.essayReviewJobs.create({ essayId: essay.essayId, content: 'x', reviewerUsername: 'keira', reviewerRole: 'student', status: 'pending' });
      const enqueue = makeSqsReviewEnqueuer(() => data, curated, now);
      await enqueue(job.jobId);
      expect((await data.essayReviewJobs.get(job.jobId))?.status).toBe('complete');
    } finally {
      if (prevEssayCoach !== undefined) process.env.ESSAY_COACH_QUEUE_URL = prevEssayCoach; else delete process.env.ESSAY_COACH_QUEUE_URL;
      if (prevFocus !== undefined) process.env.FOCUS_QUEUE_URL = prevFocus; else delete process.env.FOCUS_QUEUE_URL;
      if (prevHydration !== undefined) process.env.HYDRATION_QUEUE_URL = prevHydration; else delete process.env.HYDRATION_QUEUE_URL;
    }
  });

  it('enqueues onto the configured queue with tenant/student context + kind=review', async () => {
    const data = await mk();
    const essay = await seedEssay(data);
    const job = await data.essayReviewJobs.create({ essayId: essay.essayId, content: 'x', reviewerUsername: 'keira', reviewerRole: 'student', status: 'pending' });
    const sent: unknown[] = [];
    const client: SqsSender = { send: async (command) => { sent.push(command); return {}; } };
    const enqueue = makeSqsReviewEnqueuer(() => data, curated, now, { queueUrl: 'https://sqs.test/q', client });
    await runWithTenant('tenant-1', () => runWithStudent('student-1', () => enqueue(job.jobId)));
    expect(sent).toHaveLength(1);
    const body = JSON.parse((sent[0] as { input: { MessageBody: string } }).input.MessageBody) as Record<string, unknown>;
    expect(body).toMatchObject({ type: 'essay-coach', kind: 'review', jobId: job.jobId, tenantId: 'tenant-1', studentId: 'student-1' });
    // Enqueue path does NOT evaluate inline — left for the worker.
    expect((await data.essayReviewJobs.get(job.jobId))?.status).toBe('pending');
  });

  it('falls back to inline evaluation and logs when the SQS send throws', async () => {
    const data = await mk();
    const essay = await seedEssay(data);
    const job = await data.essayReviewJobs.create({ essayId: essay.essayId, content: 'x', reviewerUsername: 'keira', reviewerRole: 'student', status: 'pending' });
    const client: SqsSender = { send: async () => { throw new Error('sqs unavailable'); } };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const enqueue = makeSqsReviewEnqueuer(() => data, curated, now, { queueUrl: 'https://sqs.test/q', client });
      await runWithTenant('tenant-1', () => runWithStudent('student-1', () => enqueue(job.jobId)));
      expect((await data.essayReviewJobs.get(job.jobId))?.status).toBe('complete');
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});
