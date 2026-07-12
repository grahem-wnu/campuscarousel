// Certification suggestions for POST /certifications/suggest.
//
// The spec calls for Bedrock ("general knowledge → relevant certs for the career goal"). The
// suggestion logic sits behind an injectable `Suggester` seam with two implementations:
//   • makeBedrockSuggester — calls Bedrock (model/inference-profile from the BEDROCK_MODEL_ID env
//     var the Lambda role already injects; never hardcoded) and parses the model's JSON. This is
//     what production wires in routes.manifest.ts.
//   • curatedSuggester    — a deterministic fallback. The core ships with NO hardcoded
//     program-specific certs (those belong to future add-on packs), so the curated list is empty;
//     the real suggestions come from the AI path. It is still the graceful FALLBACK the Bedrock
//     suggester returns on any error/timeout/empty parse, and the default the handlers use when no
//     suggester is injected (tests).
//
// Either way, certs Keira already holds (`existingNames`) are filtered out via precise token/alias
// matching (not substrings).

import { majorPhrase } from '../../shared/ai/major.js';
import { invokeMessages, type BedrockSend } from '../../shared/metering/index.js';
import { packCertifications } from '../../shared/packs/index.js';

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

/** A suggester maps a career goal (+ intended major(s) + what the student already has) to relevant
 *  cert suggestions. `majors` lets a major pack contribute its curated baseline (e.g. nursing → CNA/BLS). */
export type Suggester = (input: {
  careerGoal: string;
  existingNames: string[];
  majors?: string[];
}) => Promise<CertSuggestion[]>;

/** Default career goal when neither the request nor the profile supplies one. */
export const DEFAULT_CAREER_GOAL = 'a college-bound high-school student';

/** A curated entry carries `aliases` — canonical short identifiers used ONLY for held-cert dedupe
 *  (e.g. "BLS" matches "BLS/CPR Certification"). Aliases are internal and never returned to the API. */
interface CuratedEntry extends CertSuggestion {
  aliases?: string[];
}

/** The core ships with NO hardcoded program-specific baseline certs — program packs (e.g. a future
 *  nursing add-on) supply their own. The AI suggester provides goal-relevant suggestions instead. */
const BASELINE: CuratedEntry[] = [];

/** Reserved for a future goal-specific curated track; empty in the generic core. */
const ICU_TRACK: CuratedEntry[] = [];

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
export const curatedSuggester: Suggester = async ({ careerGoal, existingNames, majors }) => {
  const heldTokenSets = existingNames.map(tokenSet);
  // Major packs supply the curated baseline (the core ships none); e.g. a nursing major → CNA/BLS/ACLS.
  const packEntries: CuratedEntry[] = packCertifications(majors).map((c) => ({
    name: c.name,
    issuingOrganization: c.issuingOrganization,
    why: c.why,
    priority: c.priority ?? 2,
  }));
  const raw = [...packEntries, ...(wantsIcuTrack(careerGoal) ? [...BASELINE, ...ICU_TRACK] : [...BASELINE])];
  // Dedupe the pool by name (a pack cert + a future baseline could overlap), then drop held certs.
  const byName = new Map<string, CuratedEntry>();
  for (const entry of raw) if (!byName.has(norm(entry.name))) byName.set(norm(entry.name), entry);
  const fresh = [...byName.values()].filter((entry) => {
    const keys = keysFor(entry);
    return !heldTokenSets.some((held) => sameCert(held, keys));
  });
  return fresh.sort((a, b) => a.priority - b.priority).map(toSuggestion);
};

// ---------------------------------------------------------------------------
// Bedrock-backed suggester (production). Imports the SDK directly in-module; the model/inference-
// profile id comes from BEDROCK_MODEL_ID (injected by CDK from SSM — never hardcoded). Any
// error/timeout/empty-or-malformed response falls back to the curated suggester, so /suggest is
// always useful even when Bedrock is throttled or unconfigured.
// ---------------------------------------------------------------------------

/** Minimal structural type of the Bedrock client we use (just `send`) — keeps tests injectable
 *  without depending on the SDK's concrete class. */
export interface BedrockInvoker {
  send(command: unknown): Promise<{ body?: Uint8Array }>;
}

export interface BedrockSuggesterOptions {
  /** Model / inference-profile id. Defaults to `process.env.BEDROCK_MODEL_ID`. */
  modelId?: string;
  /** Injectable client (tests). Defaults to a real `BedrockRuntimeClient`. */
  client?: BedrockInvoker;
  /** Fallback used on any failure. Defaults to the curated suggester. */
  fallback?: Suggester;
}

/** Drop a held cert that the model re-suggested anyway (defense-in-depth on top of the prompt). */
function notAlreadyHeld(name: string, heldTokenSets: Set<string>[]): boolean {
  const keys = tokenSet(name);
  return !heldTokenSets.some((held) => sameCert(held, keys));
}

/** Coerce one parsed object into a CertSuggestion, or null if it lacks the required fields. */
function toValidatedSuggestion(raw: unknown, index: number): CertSuggestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  const why = typeof o.why === 'string' ? o.why.trim() : '';
  if (!name || !why) return null;
  return {
    name,
    why,
    issuingOrganization: typeof o.issuingOrganization === 'string' ? o.issuingOrganization : undefined,
    typicalCost: typeof o.typicalCost === 'number' && o.typicalCost >= 0 ? o.typicalCost : undefined,
    renewalFrequency: typeof o.renewalFrequency === 'string' ? o.renewalFrequency : undefined,
    priority: typeof o.priority === 'number' ? o.priority : index + 1,
  };
}

/** Parse the JSON array of suggestions out of the assistant's completion text (tolerating ```json
 *  fences / surrounding prose). Throws on no array. */
function parseModelSuggestions(text: string): CertSuggestion[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('no JSON array in model output');
  const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!Array.isArray(arr)) throw new Error('model output is not an array');
  return arr.map(toValidatedSuggestion).filter((s): s is CertSuggestion => s !== null);
}

/** Build the prompt instructing the model to return ONLY a JSON array, excluding held certs. */
function buildPrompt(careerGoal: string, existingNames: string[], majors?: string[]): string {
  const held = existingNames.length ? existingNames.join(', ') : '(none yet)';
  const majorLine = majors && majors.length ? `Their intended major(s): ${majorPhrase(majors)}.` : '';
  return [
    `A high-school student is working toward their intended college program. Their stated goal: "${careerGoal}".`,
    ...(majorLine ? [majorLine] : []),
    `They already hold or track these certifications: ${held}.`,
    'Suggest 4–8 certifications relevant to that goal that they do NOT already have.',
    'Respond with ONLY a JSON array (no prose, no code fences) where each element is:',
    '{"name": string, "issuingOrganization": string, "why": string (one sentence),',
    '"typicalCost": number (USD, 0 if free), "renewalFrequency": string, "priority": number (1 = do first)}.',
  ].join('\n');
}

/**
 * Production suggester: ask Bedrock, validate + dedupe the result, and gracefully fall back to the
 * curated list on any problem. Never throws — `/suggest` always returns something useful.
 */
export function makeBedrockSuggester(options: BedrockSuggesterOptions = {}): Suggester {
  const fallback = options.fallback ?? curatedSuggester;
  return async ({ careerGoal, existingNames, majors }) => {
    const modelId = options.modelId ?? process.env.BEDROCK_MODEL_ID;
    if (!modelId) return fallback({ careerGoal, existingNames, majors });
    try {
      // Funnels through the metered `invokeMessages` seam so token usage is attributed to the
      // family + `cert-suggest`.
      const text = await invokeMessages({
        feature: 'cert-suggest',
        prompt: buildPrompt(careerGoal, existingNames, majors),
        maxTokens: 1024,
        modelId,
        client: options.client as BedrockSend | undefined,
      });
      const heldTokenSets = existingNames.map(tokenSet);
      const suggestions = parseModelSuggestions(text)
        .filter((s) => notAlreadyHeld(s.name, heldTokenSets))
        .sort((a, b) => a.priority - b.priority);
      return suggestions.length > 0 ? suggestions : fallback({ careerGoal, existingNames, majors });
    } catch {
      return fallback({ careerGoal, existingNames, majors });
    }
  };
}
