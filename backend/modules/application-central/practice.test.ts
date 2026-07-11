import { describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { runPracticeJob } from './practice.js';
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
