// Pure aggregation for GET /experience/summary. Kept separate from the handler so it is trivially
// unit-tested. Callers MUST pass an already visibility-filtered list (private entries excluded for
// non-students) — this function does no filtering of its own.

import type { ExperienceEntry } from '../../shared/data/index.js';

export interface ExperienceSummary {
  totalEntries: number;
  totalHours: number;
  /** Hours on entries flagged `patientInteraction: true`. */
  patientInteractionHours: number;
  /** Hours on entries NOT flagged for patient interaction (observational/other). */
  observationalHours: number;
  /** Sum of `hours` per facility. */
  hoursByFacility: Record<string, number>;
  /** Sum of `hours` per department (entries with no department are grouped under "Unspecified"). */
  hoursByDepartment: Record<string, number>;
  /** Sum of `hours` per `YYYY-MM` month, for the trend chart. */
  hoursByMonth: Record<string, number>;
  /** Count of entries per `YYYY-MM` month. */
  countsByMonth: Record<string, number>;
}

const NO_DEPARTMENT = 'Unspecified';
const monthOf = (isoDate: string): string => isoDate.slice(0, 7); // YYYY-MM

export function summarize(entries: readonly ExperienceEntry[]): ExperienceSummary {
  const hoursByFacility: Record<string, number> = {};
  const hoursByDepartment: Record<string, number> = {};
  const hoursByMonth: Record<string, number> = {};
  const countsByMonth: Record<string, number> = {};
  let totalHours = 0;
  let patientInteractionHours = 0;

  for (const c of entries) {
    const hours = typeof c.hours === 'number' ? c.hours : 0;
    totalHours += hours;
    if (c.patientInteraction) patientInteractionHours += hours;

    hoursByFacility[c.facility] = (hoursByFacility[c.facility] ?? 0) + hours;
    const dept = c.department && c.department.length > 0 ? c.department : NO_DEPARTMENT;
    hoursByDepartment[dept] = (hoursByDepartment[dept] ?? 0) + hours;

    if (c.date) {
      const m = monthOf(c.date);
      hoursByMonth[m] = (hoursByMonth[m] ?? 0) + hours;
      countsByMonth[m] = (countsByMonth[m] ?? 0) + 1;
    }
  }

  return {
    totalEntries: entries.length,
    totalHours,
    patientInteractionHours,
    observationalHours: totalHours - patientInteractionHours,
    hoursByFacility,
    hoursByDepartment,
    hoursByMonth,
    countsByMonth,
  };
}
