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

/** A curated entry carries `aliases` — canonical short identifiers used ONLY for held-cert dedupe
 *  (e.g. "BLS" matches "BLS/CPR Certification"). Aliases are internal and never returned to the API. */
interface CuratedEntry extends CertSuggestion {
  aliases?: string[];
}

/** Foundational certs every aspiring nursing student benefits from (the spec's named baseline). */
const BASELINE: CuratedEntry[] = [
  {
    name: 'BLS/CPR Certification',
    issuingOrganization: 'American Heart Association',
    why: 'Basic Life Support is required for nearly every clinical placement and nursing program.',
    typicalCost: 90,
    renewalFrequency: 'Every 2 years',
    priority: 1,
    aliases: ['bls', 'cpr'],
  },
  {
    name: 'Certified Nursing Assistant (CNA)',
    issuingOrganization: 'State Board of Nursing',
    why: 'Hands-on patient-care experience that strengthens a BSN application and pays while you learn.',
    typicalCost: 1200,
    renewalFrequency: 'Every 2 years',
    priority: 2,
    aliases: ['cna'],
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
    aliases: ['stb'],
  },
];

/** Certs tied to ICU / critical-care / acute goals — surfaced when the goal mentions them. */
const ICU_TRACK: CuratedEntry[] = [
  {
    name: 'Advanced Cardiovascular Life Support (ACLS)',
    issuingOrganization: 'American Heart Association',
    why: 'Core to ICU and critical-care nursing; a clear signal of an ICU-focused goal.',
    typicalCost: 250,
    renewalFrequency: 'Every 2 years',
    priority: 5,
    aliases: ['acls'],
  },
  {
    name: 'Pediatric Advanced Life Support (PALS)',
    issuingOrganization: 'American Heart Association',
    why: 'Valuable if your critical-care interest includes pediatric or NICU/PICU settings.',
    typicalCost: 250,
    renewalFrequency: 'Every 2 years',
    priority: 6,
    aliases: ['pals'],
  },
];

const norm = (s: string): string => s.trim().toLowerCase();

/** Generic words that carry no identifying signal — excluded so they never drive a dedupe match. */
const STOPWORDS = new Set([
  'certification',
  'certificate',
  'cert',
  'certified',
  'license',
  'licensure',
  'training',
  'course',
  'program',
  'the',
  'of',
  'in',
  'for',
  'and',
  'a',
  'an',
]);

/** Significant tokens of a name (lowercased words ≥2 chars, minus stopwords). */
function tokenSet(name: string): Set<string> {
  return new Set(
    norm(name)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
  );
}

/** The dedupe keys for a curated entry: significant tokens of its name plus its aliases. */
function keysFor(entry: CuratedEntry): Set<string> {
  const keys = tokenSet(entry.name);
  for (const a of entry.aliases ?? []) keys.add(norm(a));
  return keys;
}

/**
 * Whether a held cert (its significant token set) refers to the same cert as a curated entry.
 * Match iff one non-empty token set is a subset of the other — so "CNA" ↔ "Certified Nursing
 * Assistant (CNA)" match on the shared `cna`, while "BLS/CPR" never matches "ACLS". An empty held
 * set (e.g. a blank or all-stopword name) matches nothing, fixing the prior substring over-filter.
 */
function sameCert(heldTokens: Set<string>, keys: Set<string>): boolean {
  if (heldTokens.size === 0 || keys.size === 0) return false;
  const [small, big] = heldTokens.size <= keys.size ? [heldTokens, keys] : [keys, heldTokens];
  for (const t of small) if (!big.has(t)) return false;
  return true;
}

/** Career-goal keywords that unlock the ICU/critical-care track. */
function wantsIcuTrack(careerGoal: string): boolean {
  const g = norm(careerGoal);
  return ['icu', 'critical', 'acute', 'emergency', 'trauma', 'intensive'].some((k) => g.includes(k));
}

/** Strip internal-only fields before returning to the API. */
function toSuggestion({ aliases: _aliases, ...rest }: CuratedEntry): CertSuggestion {
  return rest;
}

/**
 * The deterministic curated suggester. No network, no clock — safe in tests and as a production
 * fallback. Filters out certs Keira already holds via precise token/alias matching (not substrings).
 */
export const curatedSuggester: Suggester = async ({ careerGoal, existingNames }) => {
  const heldTokenSets = existingNames.map(tokenSet);
  const pool = wantsIcuTrack(careerGoal) ? [...BASELINE, ...ICU_TRACK] : [...BASELINE];
  const fresh = pool.filter((entry) => {
    const keys = keysFor(entry);
    return !heldTokenSets.some((held) => sameCert(held, keys));
  });
  return fresh.sort((a, b) => a.priority - b.priority).map(toSuggestion);
};
