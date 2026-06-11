import { describe, expect, it } from 'vitest';
import type { College, Visit } from '../../shared/data/index.js';
import { curatedPrep, logisticsFor, makeBedrockPrep, PROGRAM_QUESTIONS, type BedrockInvoker } from './prep.js';

const college = (over: Partial<College> = {}): College => ({
  collegeId: 'uci',
  name: 'UC Irvine',
  location: 'Irvine, CA',
  contactInfo: { programAdmissionsEmail: 'nursing@uci.edu', campusVisitUrl: 'https://uci.edu/visit' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const visit = (over: Partial<Visit> = {}): Visit => ({
  collegeId: 'uci',
  visitId: 'v1',
  date: '2026-04-10',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('logisticsFor', () => {
  it('pulls address, contact, and campus-visit url from the college', () => {
    const l = logisticsFor(college());
    expect(l.address).toBe('Irvine, CA');
    expect(l.contact).toBe('nursing@uci.edu');
    expect(l.campusVisitUrl).toBe('https://uci.edu/visit');
  });
  it('leaves fields undefined when the college lacks them', () => {
    const l = logisticsFor(college({ location: undefined, contactInfo: undefined }));
    expect(l.address).toBeUndefined();
    expect(l.contact).toBeUndefined();
  });
});

describe('curatedPrep', () => {
  it('returns the full program-question checklist + logistics, marked curated', async () => {
    const p = await curatedPrep({ college: college(), visit: visit() });
    expect(p.source).toBe('curated');
    expect(p.questions).toEqual([...PROGRAM_QUESTIONS]);
    expect(p.logistics.contact).toBe('nursing@uci.edu');
    expect(p.bestTime).toMatch(/classes are in session/i);
  });
  it('tailors best-time guidance to the visit type', async () => {
    const p = await curatedPrep({ college: college(), visit: visit({ visitType: 'open-house' }) });
    expect(p.bestTime).toMatch(/open-house|admitted-student/i);
  });
});

describe('makeBedrockPrep', () => {
  it('falls back to curated when no model id is configured', async () => {
    const gen = makeBedrockPrep({ modelId: undefined });
    const p = await gen({ college: college(), visit: visit() });
    expect(p.source).toBe('curated');
  });

  it('enriches best-time + appends extra questions from the model (source=ai)', async () => {
    const fakeBody = {
      content: [{ text: '{"bestTime":"Visit during the April open house.","extraQuestions":["Ask about the sim lab"]}' }],
    };
    const client: BedrockInvoker = {
      send: async () => ({ body: new TextEncoder().encode(JSON.stringify(fakeBody)) }),
    };
    const gen = makeBedrockPrep({ modelId: 'test-model', client });
    const p = await gen({ college: college(), visit: visit() });
    expect(p.source).toBe('ai');
    expect(p.bestTime).toBe('Visit during the April open house.');
    expect(p.questions).toContain('Ask about the sim lab');
    expect(p.questions.length).toBe(PROGRAM_QUESTIONS.length + 1);
  });

  it('falls back to curated when the model throws', async () => {
    const client: BedrockInvoker = { send: async () => { throw new Error('boom'); } };
    const gen = makeBedrockPrep({ modelId: 'test-model', client });
    const p = await gen({ college: college(), visit: visit() });
    expect(p.source).toBe('curated');
    expect(p.questions).toEqual([...PROGRAM_QUESTIONS]);
  });

  it('falls back when the model output has no JSON object', async () => {
    const client: BedrockInvoker = {
      send: async () => ({ body: new TextEncoder().encode(JSON.stringify({ content: [{ text: 'no json here' }] })) }),
    };
    const gen = makeBedrockPrep({ modelId: 'test-model', client });
    const p = await gen({ college: college(), visit: visit() });
    expect(p.source).toBe('curated');
  });
});
