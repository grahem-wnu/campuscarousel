import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  makeAssistant,
  resolveMode,
  toolsUsedFor,
  unavailableAssistant,
  type ContextBundle,
} from './chat.js';

const bundle = (over: Partial<ContextBundle> = {}): ContextBundle => ({
  role: 'student',
  mode: 'ask',
  page: {},
  summary: { gpa: 3.8, bestTeas: 85, clinicalHours: 40, volunteerHours: 60, collegeCount: 3, goalCount: 5 },
  records: [],
  ...over,
});

describe('resolveMode', () => {
  it('honors an explicit mode', () => {
    expect(resolveMode({ mode: 'essay-partner' })).toBe('essay-partner');
  });
  it('derives essay-partner from an essay context or the motivation/application pages', () => {
    expect(resolveMode({ essayId: 'e1' })).toBe('essay-partner');
    expect(resolveMode({ module: 'motivations' })).toBe('essay-partner');
    expect(resolveMode({ module: 'application-central' })).toBe('essay-partner');
  });
  it('derives discovery modes from the page module', () => {
    expect(resolveMode({ module: 'college-hub' })).toBe('college-discovery');
    expect(resolveMode({ module: 'scholarship-tracker' })).toBe('scholarship-discovery');
  });
  it('defaults to ask', () => {
    expect(resolveMode(undefined)).toBe('ask');
    expect(resolveMode({ module: 'dashboard' })).toBe('ask');
  });
});

describe('buildSystemPrompt', () => {
  it('includes role, the data snapshot, and grounding records', () => {
    const p = buildSystemPrompt(
      bundle({ records: [{ kind: 'motivation', text: 'The night shift: it changed me.' }] }),
    );
    expect(p).toContain('role is "student"');
    expect(p).toContain('Experience hours: 40');
    expect(p).toContain('Colleges tracked: 3');
    expect(p).toContain('The night shift: it changed me.');
  });
  it('gives essay-partner the "never write the essay" instruction', () => {
    expect(buildSystemPrompt(bundle({ mode: 'essay-partner' }))).toContain('never write the essay');
  });
});

describe('toolsUsedFor', () => {
  it('reports profile-data grounding', () => {
    expect(toolsUsedFor(bundle())).toContain('profile-data');
  });
});

describe('makeAssistant', () => {
  it('returns the model reply trimmed, with tools + empty citations', async () => {
    const a = makeAssistant(async () => '  Here is some advice.  ');
    const r = await a.reply(bundle(), [], 'How am I doing?');
    expect(r.response).toBe('Here is some advice.');
    expect(r.toolsUsed).toContain('profile-data');
    expect(r.citations).toEqual([]);
  });

  it('passes the system prompt and the full message turn list to the invoker', async () => {
    let captured: { system: string; messages: { role: string; content: string }[] } | null = null;
    const a = makeAssistant(async (system, messages) => {
      captured = { system, messages };
      return 'ok';
    });
    await a.reply(bundle(), [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }], 'now');
    expect(captured!.messages.map((m) => m.content)).toEqual(['earlier', 'reply', 'now']);
    expect(captured!.system).toContain('college-prep app');
  });

  it('surfaces an invoker failure as a 502', async () => {
    const a = makeAssistant(async () => {
      throw new Error('bedrock down');
    });
    await expect(a.reply(bundle(), [], 'hi')).rejects.toMatchObject({ status: 502 });
  });
});

describe('unavailableAssistant', () => {
  it('rejects with a 503', async () => {
    await expect(unavailableAssistant.reply(bundle(), [], 'hi')).rejects.toMatchObject({ status: 503 });
  });
});
