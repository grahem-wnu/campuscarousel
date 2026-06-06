import { describe, expect, it } from 'vitest';
import {
  READINESS_META,
  STATUS_META,
  cellText,
  fmtGpa,
  fmtNum,
  isEmptyMatrix,
  readinessMeta,
  severityTone,
  statusMeta,
} from './logic';

describe('readinessMeta', () => {
  it('maps each readiness to a label + tone', () => {
    expect(readinessMeta('strong')).toEqual(READINESS_META.strong);
    expect(readinessMeta('needs-work').label).toBe('Needs Work');
  });
  it('falls back to insufficient-data when undefined', () => {
    expect(readinessMeta(undefined).label).toBe('Insufficient Data');
  });
});

describe('statusMeta — color coding', () => {
  it('greens "above", yellows "at"/meets, reds "below"', () => {
    expect(statusMeta('above').cell).toContain('success');
    expect(statusMeta('at').cell).toContain('warn');
    expect(statusMeta('below').cell).toContain('error');
  });
  it('grays an absent status and not-taken', () => {
    expect(statusMeta(undefined).cell).toContain('ink');
    expect(STATUS_META['not-taken'].cell).toContain('ink');
  });
});

describe('formatting', () => {
  it('fmtGpa keeps two decimals, em-dash when absent', () => {
    expect(fmtGpa(3.8)).toBe('3.80');
    expect(fmtGpa(undefined)).toBe('—');
  });
  it('fmtNum rounds, em-dash when absent', () => {
    expect(fmtNum(85.4)).toBe('85');
    expect(fmtNum(undefined)).toBe('—');
  });
  it('cellText shows keira / school', () => {
    expect(cellText(90, 85)).toBe('90 / 85');
    expect(cellText(3.9, 3.8, true)).toBe('3.90 / 3.80');
    expect(cellText(undefined, 40)).toBe('— / 40');
  });
});

describe('isEmptyMatrix', () => {
  it('is true only with no rows', () => {
    expect(isEmptyMatrix([])).toBe(true);
    expect(isEmptyMatrix([{}])).toBe(false);
  });
});

describe('severityTone', () => {
  it('maps severities to badge tones', () => {
    expect(severityTone('high')).toBe('error');
    expect(severityTone('medium')).toBe('warn');
    expect(severityTone('low')).toBe('neutral');
  });
});
