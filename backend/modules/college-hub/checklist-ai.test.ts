import { describe, expect, it } from 'vitest';
import type { College } from '../../shared/data/index.js';
import { buildChecklistPrompt, parseChecklistSuggestions } from './checklist-ai.js';

const college = (over: Partial<College> = {}): College =>
  ({
    collegeId: 'c1',
    name: 'Arizona State University',
    status: 'researching',
    isDirectAdmit: true,
    applicationFee: 70,
    requiredTests: ['TEAS'],
    appServices: ['NursingCAS'],
    applicationDeadlines: { regularDecision: '2026-11-01 — priority' },
    ...over,
  }) as College;

describe('buildChecklistPrompt', () => {
  it('grounds the prompt in the college facts and the student major', () => {
    const p = buildChecklistPrompt(college(), ['Nursing (BSN)']);
    expect(p).toContain('Arizona State University');
    expect(p).toContain('DIRECT ADMISSION');
    expect(p).toContain('Application fee (USD): 70');
    expect(p).toContain('Required tests: TEAS');
    expect(p).toContain('Application services accepted: NursingCAS');
    expect(p).toContain('Deadline (regularDecision): 2026-11-01 — priority');
    expect(p).toMatch(/Nursing/i);
    // Asks for a bare JSON array of {label, dueDate}.
    expect(p).toContain('"label": string, "dueDate": string|null');
  });

  it('falls back gracefully when the college has almost no hydrated data', () => {
    const p = buildChecklistPrompt(college({ isDirectAdmit: undefined, applicationFee: undefined, requiredTests: undefined, appServices: undefined, applicationDeadlines: undefined }), []);
    expect(p).toContain('Limited data on this college');
    expect(p).toContain('standard application steps');
  });
});

describe('parseChecklistSuggestions', () => {
  it('extracts labels + valid ISO dueDates, tolerating surrounding prose and code fences', () => {
    const raw = 'Here you go:\n```json\n[{"label":"Submit transcript."},{"label":"Pay $70 fee","dueDate":"2026-11-01"}]\n```';
    expect(parseChecklistSuggestions(raw)).toEqual([
      { label: 'Submit transcript' }, // trailing period stripped
      { label: 'Pay $70 fee', dueDate: '2026-11-01' },
    ]);
  });

  it('drops empty labels, de-dupes case-insensitively, and rejects non-ISO dueDates', () => {
    const raw = '[{"label":"Apply"},{"label":"apply"},{"label":""},{"label":"Send essay","dueDate":"this fall"}]';
    expect(parseChecklistSuggestions(raw)).toEqual([{ label: 'Apply' }, { label: 'Send essay' }]);
  });

  it('returns [] on unparseable output instead of throwing', () => {
    expect(parseChecklistSuggestions('the model said no')).toEqual([]);
    expect(parseChecklistSuggestions('[not json')).toEqual([]);
  });

  it('caps the number of suggestions', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `Step ${i}` }));
    expect(parseChecklistSuggestions(JSON.stringify(many), 15)).toHaveLength(15);
  });
});
