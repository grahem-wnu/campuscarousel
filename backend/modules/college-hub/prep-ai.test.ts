import { describe, expect, it } from 'vitest';
import type { College } from '../../shared/data/index.js';
import { buildPrepPrompt, parsePrepPlan } from './prep-ai.js';

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
