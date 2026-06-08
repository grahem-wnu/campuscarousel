import { describe, expect, it } from 'vitest';
import type { College } from '../../shared/data/index.js';
import {
  buildGapsPrompt,
  buildResearchPrompt,
  makeResearcher,
  parseGaps,
  parseResearch,
  unavailableResearcher,
} from './researcher.js';
import type { MatrixRow } from './compare.js';
import type { KeiraStats } from './stats.js';

const college = (over: Partial<College> = {}): College =>
  ({ collegeId: 'c1', name: 'UCLA', location: 'Los Angeles, CA', createdAt: '', updatedAt: '', ...over }) as College;

const stats: KeiraStats = { gpa: 3.7, teasScore: 82, clinicalHours: 30, volunteerHours: 40, certifications: ['CNA'] };

describe('buildResearchPrompt', () => {
  it('names the college and demands JSON only', () => {
    const p = buildResearchPrompt(college(), 'direct-admit');
    expect(p).toContain('UCLA');
    expect(p).toContain('Los Angeles, CA');
    expect(p).toContain('Focus: direct-admit.');
    expect(p).toContain('Return ONLY a JSON object');
  });
});

describe('parseResearch', () => {
  it('extracts a JSON object embedded in prose and coerces fields', () => {
    const raw = 'Here you go: {"avgGPAAdmitted": 3.85, "avgTEASScore": 86, "typicalClinicalHours": 45, "typicalCertifications": ["CNA","BLS"], "competitiveEdges": ["leadership"]} hope it helps';
    expect(parseResearch(raw)).toEqual({
      avgGPAAdmitted: 3.85,
      avgTEASScore: 86,
      typicalClinicalHours: 45,
      typicalCertifications: ['CNA', 'BLS'],
      competitiveEdges: ['leadership'],
    });
  });
  it('returns {} on unparseable output', () => {
    expect(parseResearch('no json here')).toEqual({});
    expect(parseResearch('{ broken')).toEqual({});
  });
  it('drops non-numeric numbers and empty lists', () => {
    expect(parseResearch('{"avgGPAAdmitted": "high", "typicalCertifications": []}')).toEqual({});
  });
});

describe('buildGapsPrompt', () => {
  it('includes her stats and the data-bearing target rows', () => {
    const rows: MatrixRow[] = [
      { collegeId: 'c1', collegeName: 'UCLA', benchmark: { avgGPAAdmitted: 3.9, hasData: true }, comparison: { overallReadiness: 'competitive' } },
      { collegeId: 'c2', collegeName: 'NoData U', benchmark: { hasData: false }, comparison: { overallReadiness: 'insufficient-data' } },
    ];
    const p = buildGapsPrompt(stats, rows);
    expect(p).toContain('GPA 3.7');
    expect(p).toContain('UCLA');
    expect(p).not.toContain('NoData U'); // rows without data are omitted
    expect(p).toContain('Return ONLY a JSON object');
  });
});

describe('parseGaps', () => {
  it('parses summary + well-formed gaps and defaults bad severities to medium', () => {
    const raw = '{"summary":"Close clinical hours.","gaps":[{"metric":"clinical","severity":"high","recommendation":"Add 20h"},{"metric":"gpa","severity":"???","recommendation":"Retake bio"}]}';
    const out = parseGaps(raw);
    expect(out.summary).toBe('Close clinical hours.');
    expect(out.gaps).toEqual([
      { metric: 'clinical', severity: 'high', recommendation: 'Add 20h' },
      { metric: 'gpa', severity: 'medium', recommendation: 'Retake bio' },
    ]);
  });
  it('drops gaps missing a metric or recommendation; empty summary when absent', () => {
    expect(parseGaps('{"gaps":[{"metric":"x"}]}')).toEqual({ summary: '', gaps: [] });
    expect(parseGaps('garbage')).toEqual({ summary: '', gaps: [] });
  });
});

describe('makeResearcher', () => {
  it('research returns the parsed profile on success', async () => {
    const r = makeResearcher(async () => '{"avgGPAAdmitted": 3.8}');
    expect(await r.research(college())).toEqual({ avgGPAAdmitted: 3.8 });
  });
  it('research surfaces an invoker failure as a 502 (explicit user action, no silent empty refresh)', async () => {
    const r = makeResearcher(async () => {
      throw new Error('bedrock down');
    });
    await expect(r.research(college())).rejects.toMatchObject({ status: 502 });
  });

  it('research still tolerates unparseable model output (returns {})', async () => {
    const r = makeResearcher(async () => 'no json at all');
    expect(await r.research(college())).toEqual({});
  });
  it('analyzeGaps returns analysis on success', async () => {
    const r = makeResearcher(async () => '{"summary":"ok","gaps":[]}');
    expect(await r.analyzeGaps(stats, [])).toEqual({ summary: 'ok', gaps: [] });
  });
  it('analyzeGaps throws a 502 on invoker failure', async () => {
    const r = makeResearcher(async () => {
      throw new Error('bedrock down');
    });
    await expect(r.analyzeGaps(stats, [])).rejects.toMatchObject({ status: 502 });
  });
});

describe('unavailableResearcher', () => {
  it('rejects both operations with a 503', async () => {
    await expect(unavailableResearcher.research(college())).rejects.toMatchObject({ status: 503 });
    await expect(unavailableResearcher.analyzeGaps(stats, [])).rejects.toMatchObject({ status: 503 });
  });
});
