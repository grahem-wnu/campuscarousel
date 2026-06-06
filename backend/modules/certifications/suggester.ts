// Certification suggestions for POST /certifications/suggest.
//
// The spec calls for Bedrock ("general knowledge → relevant certs for the career goal"). The shared
// backend bundle does not yet ship a Bedrock client (`@aws-sdk/client-bedrock-runtime` is not a
// backend dependency, and adding it means editing a frozen shared file — raised for the supervisor
// on .agent-bus/checkpoints/certifications.md). So this module ships the suggestion logic behind an
// injectable seam: a deterministic, career-goal-aware CURATED suggester is the default, and a
// Bedrock-backed `Suggester` can be dropped into the manifest later without touching handlers/tests.
//
// The curated list is grounded in the spec's named baseline (CNA, BLS/CPR, First Aid, Stop the
// Bleed) plus ICU/critical-care additions tailored to the stated goal. Already-held certs are
// filtered out by the caller-supplied `existingNames`.

export interface CertSuggestion {
  name: string;
  issuingOrganization?: string;
  /** Why this cert is relevant to the career goal — shown under the suggestion. */
  why: string;
  typicalCost?: number;
  renewalFrequency?: string;
  /** Rough priority for ordering: 1 = foundational/do-first. */
  priority: number;
}

/** A suggester maps a career goal (+ what Keira already has) to relevant cert suggestions. */
export type Suggester = (input: {
  careerGoal: string;
  existingNames: string[];
}) => Promise<CertSuggestion[]>;

/** Default career goal when neither the request nor the profile supplies one. */
export const DEFAULT_CAREER_GOAL = 'aspiring BSN nursing student aiming for ICU / critical care';

/** Foundational certs every aspiring nursing student benefits from (the spec's named baseline). */
const BASELINE: CertSuggestion[] = [
  {
    name: 'BLS/CPR Certification',
    issuingOrganization: 'American Heart Association',
    why: 'Basic Life Support is required for nearly every clinical placement and nursing program.',
    typicalCost: 90,
    renewalFrequency: 'Every 2 years',
    priority: 1,
  },
  {
    name: 'Certified Nursing Assistant (CNA)',
    issuingOrganization: 'State Board of Nursing',
    why: 'Hands-on patient-care experience that strengthens a BSN application and pays while you learn.',
    typicalCost: 1200,
    renewalFrequency: 'Every 2 years',
    priority: 2,
  },
  {
    name: 'First Aid Certification',
    issuingOrganization: 'American Red Cross',
    why: 'Foundational emergency-response skills; often bundled with BLS/CPR.',
    typicalCost: 70,
    renewalFrequency: 'Every 2 years',
    priority: 3,
  },
  {
    name: 'Stop the Bleed',
    issuingOrganization: 'American College of Surgeons',
    why: 'Short, low-cost hemorrhage-control training that shows initiative on an application.',
    typicalCost: 0,
    renewalFrequency: 'No formal expiration',
    priority: 4,
  },
];

/** Certs tied to ICU / critical-care / acute goals — surfaced when the goal mentions them. */
const ICU_TRACK: CertSuggestion[] = [
  {
    name: 'Advanced Cardiovascular Life Support (ACLS)',
    issuingOrganization: 'American Heart Association',
    why: 'Core to ICU and critical-care nursing; a clear signal of an ICU-focused goal.',
    typicalCost: 250,
    renewalFrequency: 'Every 2 years',
    priority: 5,
  },
  {
    name: 'Pediatric Advanced Life Support (PALS)',
    issuingOrganization: 'American Heart Association',
    why: 'Valuable if your critical-care interest includes pediatric or NICU/PICU settings.',
    typicalCost: 250,
    renewalFrequency: 'Every 2 years',
    priority: 6,
  },
];

const norm = (s: string): string => s.trim().toLowerCase();

/** Career-goal keywords that unlock the ICU/critical-care track. */
function wantsIcuTrack(careerGoal: string): boolean {
  const g = norm(careerGoal);
  return ['icu', 'critical', 'acute', 'emergency', 'trauma', 'er', 'intensive'].some((k) =>
    g.includes(k),
  );
}

/**
 * The deterministic curated suggester. No network, no clock — safe in tests and as a production
 * fallback. Filters out anything Keira already has (case-insensitive, substring-tolerant).
 */
export const curatedSuggester: Suggester = async ({ careerGoal, existingNames }) => {
  const have = existingNames.map(norm);
  const pool = wantsIcuTrack(careerGoal) ? [...BASELINE, ...ICU_TRACK] : [...BASELINE];
  const fresh = pool.filter((s) => {
    const name = norm(s.name);
    return !have.some((h) => h.includes(name) || name.includes(h));
  });
  return fresh.sort((a, b) => a.priority - b.priority);
};
