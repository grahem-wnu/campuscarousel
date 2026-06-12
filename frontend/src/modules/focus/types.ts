// Shapes returned by GET /focus (the major-pack page). Mirror the backend focus handler + packs.

export interface PackCertification {
  name: string;
  issuingOrganization?: string;
  why: string;
  priority?: number;
}

export interface PackSummary {
  key: string;
  label: string;
  focusBrief: string;
  certifications: PackCertification[];
  entranceExam?: { examName: string; competitiveScore?: number; note?: string };
  interviewQuestions: string[];
  visitQuestions: string[];
}

export interface FocusSource {
  title: string;
  url: string;
}

export interface FocusOverview {
  status: "pending" | "complete" | "failed";
  generatedFor: string[];
  overview?: string;
  sources?: FocusSource[];
  error?: string;
  updatedAt?: string;
}

export interface FocusResponse {
  majors: string[];
  careerGoal: string | null;
  packs: PackSummary[];
  overview: FocusOverview | null;
  /** True when a cached overview was generated for different majors than are set now. */
  stale: boolean;
}
