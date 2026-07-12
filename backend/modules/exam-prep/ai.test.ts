import { describe, expect, it } from 'vitest';
import {
  buildAnalyzePrompt,
  buildPlanPrompt,
  curatedAnalyzer,
  curatedPlanner,
  extractJson,
  makeBedrockAnalyzer,
  makeBedrockPlanner,
  type AnalyzeContext,
  type BedrockInvoker,
  type PlanInput,
} from './ai.js';
import type { ProgressSummary } from './progress.js';

const MODEL = 'us.anthropic.test-model';
function stub(text: string): BedrockInvoker {
  return { send: async () => ({ body: new TextEncoder().encode(JSON.stringify({ content: [{ text }] })) }) };
}
const throwing: BedrockInvoker = {
  send: async () => {
    throw new Error('ThrottlingException');
  },
};

const planInput = (over: Partial<PlanInput> = {}): PlanInput => ({
  weeksUntilExam: 4,
  targetScore: 78,
  hoursPerWeek: 8,
  weakSections: ['Math'],
  latestOverall: 70,
  ...over,
});

const summary: ProgressSummary = {
  attempts: 2,
  latestOverall: 70,
  bestOverall: 72,
  trend: 10,
  cumulativeStudyHours: 8,
  weakSections: ['math'],
  sectionBands: { math: 'needs-work' },
};
const ctx = (over: Partial<AnalyzeContext> = {}): AnalyzeContext => ({ summary, targetScore: 78, ...over });

describe('extractJson', () => {
  it('extracts object/array, tolerating fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('[1,2]')).toEqual([1, 2]);
    expect(() => extractJson('no json')).toThrow();
  });
});

describe('major-aware prompts', () => {
  it('study-plan names the exam + major and folds in pack guidance', () => {
    const p = buildPlanPrompt(planInput({ examName: 'TEAS', majors: ['Nursing'] }));
    expect(p).toContain('TEAS');
    expect(p).toContain('Nursing');
    expect(p).toContain('Major-specific guidance:');
  });

  it('analyze names the exam + major and folds in pack guidance', () => {
    const p = buildAnalyzePrompt(ctx({ examName: 'TEAS', majors: ['Nursing'] }));
    expect(p).toContain('TEAS');
    expect(p).toContain('Nursing');
    expect(p).toContain('Major-specific guidance:');
  });

  it('stays neutral with no exam/major', () => {
    const p = buildPlanPrompt(planInput());
    expect(p).toContain('the entrance/standardized exam');
    expect(p).toContain('their intended college program');
    expect(p).not.toContain('Major-specific guidance:');
  });
});

describe('curatedPlanner', () => {
  it('builds a week-per-week plan prioritizing weak sections', async () => {
    const plan = await curatedPlanner(planInput({ weeksUntilExam: 4 }));
    expect(plan.source).toBe('curated');
    expect(plan.weeks).toHaveLength(4);
    expect(plan.weeks.every((w) => w.focus.includes('Math'))).toBe(true);
    expect(plan.weeks.at(-1)?.practice).toMatch(/practice test/i);
  });

  it('covers all sections when none are weak, and clamps the horizon', async () => {
    const plan = await curatedPlanner(planInput({ weakSections: [], weeksUntilExam: 99 }));
    expect(plan.weeks).toHaveLength(12); // clamped
    expect(plan.focusAreas.length).toBe(4);
  });
});

describe('curatedAnalyzer', () => {
  it('recommends the weakest section and frames readiness vs target', async () => {
    const a = await curatedAnalyzer(ctx());
    expect(a.source).toBe('curated');
    expect(a.recommendations.join(' ')).toMatch(/math/i);
    expect(a.readiness).toMatch(/78/);
  });
});

describe('makeBedrockPlanner', () => {
  it('uses parsed model output on success', async () => {
    const planner = makeBedrockPlanner({
      modelId: MODEL,
      client: stub(JSON.stringify({ summary: 'AI plan', focusAreas: ['Science'], weeks: [{ week: 1, focus: ['Science'], hours: 6, practice: 'drills' }] })),
    });
    const plan = await planner(planInput());
    expect(plan.source).toBe('ai');
    expect(plan.weeks).toHaveLength(1);
    expect(plan.summary).toBe('AI plan');
  });

  it('falls back to curated on error or empty weeks', async () => {
    expect((await makeBedrockPlanner({ modelId: MODEL, client: throwing })(planInput())).source).toBe('curated');
    const empty = makeBedrockPlanner({ modelId: MODEL, client: stub(JSON.stringify({ summary: 'x', weeks: [] })) });
    expect((await empty(planInput())).source).toBe('curated');
  });

  it('falls back to curated when no model id is configured', async () => {
    const prev = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    try {
      expect((await makeBedrockPlanner({ client: stub('{}') })(planInput())).source).toBe('curated');
    } finally {
      if (prev !== undefined) process.env.BEDROCK_MODEL_ID = prev;
    }
  });
});

describe('makeBedrockAnalyzer', () => {
  it('uses parsed model output on success and falls back on failure', async () => {
    const ok = makeBedrockAnalyzer({
      modelId: MODEL,
      client: stub(JSON.stringify({ summary: 'AI analysis', recommendations: ['Do drills'], readiness: 'close' })),
    });
    expect((await ok(ctx())).source).toBe('ai');
    expect((await makeBedrockAnalyzer({ modelId: MODEL, client: throwing })(ctx())).source).toBe('curated');
  });
});
