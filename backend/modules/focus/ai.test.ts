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
