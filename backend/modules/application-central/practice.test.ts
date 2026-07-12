import { describe, expect, it, vi } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { runWithStudent, runWithTenant } from '../../shared/tenant/index.js';
import { makeSqsPracticeEnqueuer, runPracticeJob, type SqsSender } from './practice.js';
import type { PracticeQuestionGenerator } from './ai.js';

const gen: PracticeQuestionGenerator = async ({ college }) => ({
  questions: [{ question: `q for ${college?.name ?? 'general'}`, why: 'w', tip: 't' }],
  source: 'ai' as const,
});

async function mk(): Promise<Data> { return makeData(new InMemoryTableClient()); }

describe('runPracticeJob', () => {
  it('marks complete with usedRealPrompts true for a roster college with prompts', async () => {
    const data = await mk();
    const college = await data.colleges.create({ name: 'Ohio State', status: 'applying', essayPrompts: ['Why OSU?'] } as Parameters<Data['colleges']['create']>[0]);
    const job = await data.practiceQuestionJobs.create({ collegeId: college.collegeId, status: 'pending' });
    await runPracticeJob(() => data, gen, async () => [], job.jobId);
    const after = await data.practiceQuestionJobs.get(job.jobId);
    expect(after?.status).toBe('complete');
    expect(after?.result?.usedRealPrompts).toBe(true);
    expect(after?.result?.collegeName).toBe('Ohio State');
    expect(after?.result?.questions).toHaveLength(1);
  });

  it('typed name → usedRealPrompts false; generator throw → failed', async () => {
    const data = await mk();
    const job = await data.practiceQuestionJobs.create({ collegeName: 'Imaginary U', status: 'pending' });
    await runPracticeJob(() => data, gen, async () => [], job.jobId);
    expect((await data.practiceQuestionJobs.get(job.jobId))?.result?.usedRealPrompts).toBe(false);

    const boom: PracticeQuestionGenerator = async () => { throw new Error('bedrock down'); };
    const job2 = await data.practiceQuestionJobs.create({ status: 'pending' });
    await runPracticeJob(() => data, boom, async () => [], job2.jobId);
    const after2 = await data.practiceQuestionJobs.get(job2.jobId);
    expect(after2?.status).toBe('failed');
    expect(after2?.error).toContain('bedrock down');
  });
});

describe('makeSqsPracticeEnqueuer', () => {
  it('falls back to inline generation when no queue is configured', async () => {
    const data = await mk();
    const prevEssayCoach = process.env.ESSAY_COACH_QUEUE_URL;
    const prevFocus = process.env.FOCUS_QUEUE_URL;
    const prevHydration = process.env.HYDRATION_QUEUE_URL;
    delete process.env.ESSAY_COACH_QUEUE_URL;
    delete process.env.FOCUS_QUEUE_URL;
    delete process.env.HYDRATION_QUEUE_URL;
    try {
      const job = await data.practiceQuestionJobs.create({ collegeName: 'Imaginary U', status: 'pending' });
      const enqueue = makeSqsPracticeEnqueuer(() => data, gen);
      await enqueue(job.jobId);
      // No queue → ran inline, so the job is already complete (no polling needed).
      expect((await data.practiceQuestionJobs.get(job.jobId))?.status).toBe('complete');
    } finally {
      if (prevEssayCoach !== undefined) process.env.ESSAY_COACH_QUEUE_URL = prevEssayCoach; else delete process.env.ESSAY_COACH_QUEUE_URL;
      if (prevFocus !== undefined) process.env.FOCUS_QUEUE_URL = prevFocus; else delete process.env.FOCUS_QUEUE_URL;
      if (prevHydration !== undefined) process.env.HYDRATION_QUEUE_URL = prevHydration; else delete process.env.HYDRATION_QUEUE_URL;
    }
  });

  it('enqueues onto the configured queue with the tenant/student context in the message', async () => {
    const data = await mk();
    const job = await data.practiceQuestionJobs.create({ collegeName: 'Imaginary U', status: 'pending' });
    const sent: unknown[] = [];
    const client: SqsSender = { send: async (command) => { sent.push(command); return {}; } };
    const enqueue = makeSqsPracticeEnqueuer(() => data, gen, { queueUrl: 'https://sqs.test/q', client });
    await runWithTenant('tenant-1', () => runWithStudent('student-1', () => enqueue(job.jobId)));
    expect(sent).toHaveLength(1);
    const body = JSON.parse((sent[0] as { input: { MessageBody: string } }).input.MessageBody) as Record<string, unknown>;
    expect(body).toMatchObject({ type: 'essay-coach', kind: 'questions', jobId: job.jobId, tenantId: 'tenant-1', studentId: 'student-1' });
    // Enqueue path does NOT generate inline — the job is left for the worker to complete.
    expect((await data.practiceQuestionJobs.get(job.jobId))?.status).toBe('pending');
  });

  it('falls back to inline generation and logs when the SQS send throws', async () => {
    const data = await mk();
    const job = await data.practiceQuestionJobs.create({ collegeName: 'Imaginary U', status: 'pending' });
    const client: SqsSender = { send: async () => { throw new Error('sqs unavailable'); } };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const enqueue = makeSqsPracticeEnqueuer(() => data, gen, { queueUrl: 'https://sqs.test/q', client });
      await runWithTenant('tenant-1', () => runWithStudent('student-1', () => enqueue(job.jobId)));
      expect((await data.practiceQuestionJobs.get(job.jobId))?.status).toBe('complete');
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});
