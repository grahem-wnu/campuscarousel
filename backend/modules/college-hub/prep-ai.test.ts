import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type College, type Data } from '../../shared/data/index.js';
import { runWithStudent, runWithTenant } from '../../shared/tenant/index.js';
import {
  buildPrepPrompt,
  makePrepWorkerHandler,
  makeSqsPrepEnqueuer,
  parsePrepPlan,
  type PrepSuggester,
  type SqsSender,
} from './prep-ai.js';

const college = (over: Partial<College> = {}): College =>
  ({
    collegeId: 'c1',
    name: 'Arizona State University',
    status: 'researching',
    state: 'AZ',
    avgGPAAdmitted: '3.5',
    acceptanceRateProgram: '88%',
    requiredTests: ['SAT or ACT'],
    prerequisites: ['CON 223 Strength of Materials', 'CON 252 Building Construction Methods'],
    ...over,
  }) as College;

describe('buildPrepPrompt', () => {
  it('frames a HIGH SCHOOL plan grounded in the college admission facts + major + current grade', () => {
    // Fixed date so the derived grade is deterministic: class of 2028 in spring 2026 → 10th grade.
    const p = buildPrepPrompt(college(), ['Construction Management'], 2028, new Date('2026-06-15T00:00:00Z'));
    expect(p).toMatch(/HIGH SCHOOL/);
    expect(p).toContain('graduates high school in 2028');
    expect(p).toContain('10th grade (sophomore)');
    expect(p).toContain('Arizona State University');
    expect(p).toContain('Average admitted GPA: 3.5');
    expect(p).toMatch(/Construction Management/i);
    // The college's own program courses are passed only as context, with a do-not-echo instruction.
    expect(p).toContain('for context only');
    expect(p).toMatch(/Do NOT list college courses/i);
    expect(p).toContain('"targets"');
    expect(p).toContain('"courses"');
    expect(p).toContain('"activities"');
  });
});

describe('parsePrepPlan', () => {
  it('parses headline + the three sections, tolerating code fences', () => {
    const raw = '```json\n{"headline":"Aim high!","targets":[{"label":"3.5+ GPA","detail":"matches admits"}],' +
      '"courses":[{"label":"AP Physics 1"},{"label":"AP Calculus AB","detail":"shows rigor"}],' +
      '"activities":[{"label":"Build club"}]}\n```';
    const plan = parsePrepPlan(raw);
    expect(plan?.headline).toBe('Aim high!');
    expect(plan?.targets).toEqual([{ label: '3.5+ GPA', detail: 'matches admits' }]);
    expect(plan?.courses.map((c) => c.label)).toEqual(['AP Physics 1', 'AP Calculus AB']);
    expect(plan?.activities).toEqual([{ label: 'Build club' }]);
  });

  it('drops label-less / duplicate items and returns null when nothing usable came back', () => {
    expect(parsePrepPlan('{"targets":[{"detail":"no label"}],"courses":[],"activities":[]}')).toBeNull();
    expect(parsePrepPlan('the model declined')).toBeNull();
    const plan = parsePrepPlan('{"courses":[{"label":"AP Bio"},{"label":"ap bio"}],"targets":[],"activities":[]}');
    expect(plan?.courses).toHaveLength(1); // case-insensitive dedupe
  });
});

describe('async prep generation (worker + enqueuer)', () => {
  let data: Data;
  const getData = () => data;
  beforeEach(() => {
    data = makeData(new InMemoryTableClient());
  });

  const PLAN = { headline: 'Go', targets: [{ label: '3.6 GPA' }], courses: [{ label: 'AP Bio' }], activities: [{ label: 'Volunteer' }] };
  const newCollege = () => data.colleges.create({ name: 'Arizona State University' } as Parameters<Data['colleges']['create']>[0]);

  it('makePrepWorkerHandler generates + persists the plan for a task:prep job, ignoring other payloads', async () => {
    const suggester: PrepSuggester = async () => PLAN;
    const handler = makePrepWorkerHandler(getData, suggester);
    await runWithTenant('t1', () =>
      runWithStudent('s1', async () => {
        const c = await newCollege();
        // Non-prep payloads are not this handler's job — left untouched.
        await handler({ collegeId: c.collegeId });
        expect((await data.colleges.get(c.collegeId))?.hsPrepStatus).toBeUndefined();
        // A prep job generates, persists the plan, and flips status to complete.
        await handler({ task: 'prep', collegeId: c.collegeId });
        const after = await data.colleges.get(c.collegeId);
        expect(after?.hsPrepPlan?.headline).toBe('Go');
        expect(after?.hsPrepStatus).toBe('complete');
      }),
    );
  });

  it('marks the college failed when generation produces nothing', async () => {
    const handler = makePrepWorkerHandler(getData, async () => null);
    await runWithTenant('t1', () =>
      runWithStudent('s1', async () => {
        const c = await newCollege();
        await handler({ task: 'prep', collegeId: c.collegeId });
        const after = await data.colleges.get(c.collegeId);
        expect(after?.hsPrepStatus).toBe('failed');
        expect(after?.hsPrepPlan).toBeUndefined();
      }),
    );
  });

  it('makeSqsPrepEnqueuer sends a task:prep message on the shared hydration queue', async () => {
    let captured: { input?: { QueueUrl?: string; MessageBody?: string } } | undefined;
    const client: SqsSender = {
      send: async (cmd) => {
        captured = cmd as { input?: { QueueUrl?: string; MessageBody?: string } };
        return {};
      },
    };
    const enqueue = makeSqsPrepEnqueuer(getData, { queueUrl: 'https://sqs.test/q', client });
    await runWithTenant('fam1', () => runWithStudent('s1', () => enqueue('college-9')));
    expect(captured?.input?.QueueUrl).toBe('https://sqs.test/q');
    expect(JSON.parse(captured?.input?.MessageBody ?? '{}')).toEqual({
      type: 'college-hydrate',
      collegeId: 'college-9',
      task: 'prep',
      tenantId: 'fam1',
      studentId: 's1',
    });
  });

  it('falls back to inline generation when the send throws', async () => {
    const throwing: SqsSender = { send: async () => { throw new Error('AccessDenied'); } };
    await runWithTenant('t1', () =>
      runWithStudent('s1', async () => {
        const c = await newCollege();
        const enqueue = makeSqsPrepEnqueuer(getData, {
          queueUrl: 'https://sqs.test/q',
          client: throwing,
          fallback: async (id) => {
            await data.colleges.mergePreservingUserEdits(id, { hsPrepStatus: 'complete' });
          },
        });
        await enqueue(c.collegeId);
        expect((await data.colleges.get(c.collegeId))?.hsPrepStatus).toBe('complete');
      }),
    );
  });
});
