import { describe, expect, it } from 'vitest';
import type { ExperienceEntry } from '../../shared/data/index.js';
import { buildDirectory } from './supervisors.js';

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

describe('buildDirectory', () => {
  it('ignores entries with no supervisor name', () => {
    expect(buildDirectory([entry({ supervisorName: undefined }), entry({ supervisorName: '  ' })])).toEqual([]);
  });

  it('groups by supervisor, summing hours and counting entries', () => {
    const dir = buildDirectory([
      entry({ supervisorName: 'Dr. A', hours: 4, facility: 'Memorial' }),
      entry({ supervisorName: 'Dr. A', hours: 2, facility: 'Lakeside' }),
      entry({ supervisorName: 'Dr. B', hours: 1 }),
    ]);
    const a = dir.find((s) => s.name === 'Dr. A')!;
    expect(a.totalHours).toBe(6);
    expect(a.entryCount).toBe(2);
    expect(a.facilities.sort()).toEqual(['Lakeside', 'Memorial']);
  });

  it('sorts by total hours desc, then name', () => {
    const dir = buildDirectory([
      entry({ supervisorName: 'Dr. Low', hours: 1 }),
      entry({ supervisorName: 'Dr. High', hours: 9 }),
    ]);
    expect(dir.map((s) => s.name)).toEqual(['Dr. High', 'Dr. Low']);
  });

  it('keeps the latest title/contact and the most recent date', () => {
    const dir = buildDirectory([
      entry({ supervisorName: 'Dr. A', supervisorTitle: 'RN', supervisorContact: 'a@x.com', date: '2026-01-01' }),
      entry({ supervisorName: 'Dr. A', supervisorTitle: 'Charge Nurse', date: '2026-03-01' }),
    ]);
    const a = dir[0]!;
    expect(a.title).toBe('Charge Nurse');
    expect(a.contact).toBe('a@x.com'); // preserved from the only entry that had it
    expect(a.lastDate).toBe('2026-03-01');
  });
});
