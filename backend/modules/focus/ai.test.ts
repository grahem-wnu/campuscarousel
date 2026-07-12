import { describe, expect, it } from 'vitest';
import { buildCareerPathPrompt, buildOverviewPrompt } from './ai.js';

describe('buildCareerPathPrompt', () => {
  it('asks for multiple routes and never locks the student into one major', () => {
    const p = buildCareerPathPrompt('Psychiatry', ['Neuroscience']);
    expect(p).toContain('Psychiatry');
    expect(p).toMatch(/your options/i); // the enumerated-routes section
    expect(p).toMatch(/no single major is required/i);
    expect(p).toMatch(/one option among several/i); // the current major is framed as just one option
  });
  it('still asks for the options when no major is set', () => {
    const p = buildCareerPathPrompt('Psychiatry');
    expect(p).toContain('Psychiatry');
    expect(p).toMatch(/your options/i);
  });
  it('injects current-grade timeline context when a graduation year is given (fixed date)', () => {
    const p = buildCareerPathPrompt('Psychiatry', [], 2030, new Date('2026-06-15T00:00:00Z'));
    expect(p).toMatch(/NOT in high school yet/); // class of 2030 is pre-HS in mid-2026
    expect(p).toContain('start 9th grade in fall 2026');
  });
  it('omits timeline context when no graduation year is given', () => {
    expect(buildCareerPathPrompt('Psychiatry', ['Neuroscience'])).not.toMatch(/TIMELINE:/);
  });
});

describe('buildOverviewPrompt', () => {
  it('frames the major as one route (not required) when a career goal is set', () => {
    const p = buildOverviewPrompt(['Neuroscience'], 'Psychiatry');
    expect(p).toContain('Psychiatry');
    expect(p).toMatch(/one route to that goal, not the only one/i);
  });
  it('omits the "one of several routes" framing when there is no career goal', () => {
    const p = buildOverviewPrompt(['Neuroscience']);
    expect(p).not.toMatch(/not the only one/i);
  });
});
