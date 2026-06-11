// Frontend types for Experience Hours. These mirror the API responses (the backend's data shapes) —
// the frontend has no access to the backend data-layer package, so the contract is restated here
// and kept in sync via the API.

export type Visibility = 'family' | 'private';

export interface ExperienceEntry {
  entryId: string;
  date: string;
  facility: string;
  department?: string;
  supervisorName?: string;
  supervisorTitle?: string;
  supervisorContact?: string;
  hours: number;
  duties?: string[];
  patientInteraction?: boolean;
  reflection?: string;
  visibility: Visibility;
  linkedActivityId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Body for create/update (the lib stamps id + timestamps). */
export interface ExperienceInput {
  date: string;
  facility: string;
  hours: number;
  department?: string;
  supervisorName?: string;
  supervisorTitle?: string;
  supervisorContact?: string;
  duties?: string[];
  patientInteraction?: boolean;
  reflection?: string;
  visibility?: Visibility;
  linkedActivityId?: string;
}

export interface ExperienceSummary {
  totalEntries: number;
  totalHours: number;
  patientInteractionHours: number;
  observationalHours: number;
  hoursByFacility: Record<string, number>;
  hoursByDepartment: Record<string, number>;
  hoursByMonth: Record<string, number>;
  countsByMonth: Record<string, number>;
}

export interface SupervisorEntry {
  name: string;
  title?: string;
  contact?: string;
  facilities: string[];
  totalHours: number;
  entryCount: number;
  lastDate?: string;
}

export interface ListFilters {
  facility?: string;
  department?: string;
  from?: string;
  to?: string;
}

/** Response shape of POST /clinical/export — a base64 PDF in a JSON envelope. */
export interface ExportResult {
  filename: string;
  contentType: string;
  base64: string;
}
