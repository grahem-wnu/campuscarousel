import { describe, expect, it } from 'vitest';
import type { ExperienceEntry } from '../../shared/data/index.js';
import { summarize } from './summary.js';

const entry = (over: Partial<ExperienceEntry> = {}): ExperienceEntry => ({
  entryId: 'x',
  date: '2026-01-15',
  facility: 'Memorial',
  hours: 4,
  visibility: 'family',
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
  ...over,
});

describe('summarize', () => {
  it('returns zeros for an empty list', () => {
    const s = summarize([]);
    expect(s).toMatchObject({
      totalEntries: 0,
      totalHours: 0,
      patientInteractionHours: 0,
      observationalHours: 0,
    });
    expect(s.hoursByFacility).toEqual({});
  });

  it('totals hours and splits patient-interaction vs observational', () => {
    const s = summarize([
      entry({ hours: 3, patientInteraction: true }),
      entry({ hours: 5, patientInteraction: false }),
      entry({ hours: 2 }), // undefined → observational
    ]);
    expect(s.totalHours).toBe(10);
    expect(s.totalEntries).toBe(3);
    expect(s.patientInteractionHours).toBe(3);
    expect(s.observationalHours).toBe(7);
  });

  it('aggregates by facility and by department (missing dept → Unspecified)', () => {
    const s = summarize([
      entry({ facility: 'Memorial', department: 'ER', hours: 4 }),
      entry({ facility: 'Memorial', department: 'ICU', hours: 2 }),
      entry({ facility: 'Lakeside', hours: 6 }), // no department
    ]);
    expect(s.hoursByFacility).toEqual({ Memorial: 6, Lakeside: 6 });
    expect(s.hoursByDepartment).toEqual({ ER: 4, ICU: 2, Unspecified: 6 });
  });

  it('aggregates hours and counts by YYYY-MM month', () => {
    const s = summarize([
      entry({ date: '2026-01-05', hours: 4 }),
      entry({ date: '2026-01-20', hours: 2 }),
      entry({ date: '2026-02-01', hours: 5 }),
    ]);
    expect(s.hoursByMonth).toEqual({ '2026-01': 6, '2026-02': 5 });
    expect(s.countsByMonth).toEqual({ '2026-01': 2, '2026-02': 1 });
  });
});
