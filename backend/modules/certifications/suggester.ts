// Certification suggestions for POST /certifications/suggest.
//
// The spec calls for Bedrock ("general knowledge → relevant certs for the career goal"). The
// suggestion logic sits behind an injectable `Suggester` seam with two implementations:
//   • makeBedrockSuggester — calls Bedrock (model/inference-profile from the BEDROCK_MODEL_ID env
//     var the Lambda role already injects; never hardcoded) and parses the model's JSON. This is
//     what production wires in routes.manifest.ts.
//   • curatedSuggester    — a deterministic, career-goal-aware curated list grounded in the spec's
//     named baseline (CNA, BLS/CPR, First Aid, Stop the Bleed) plus ICU/critical-care additions.
//     It is the graceful FALLBACK the Bedrock suggester returns on any error/timeout/empty parse,
//     and the default the handlers use when no suggester is injected (tests).
//
// Either way, certs Keira already holds (`existingNames`) are filtered out via precise token/alias
// matching (not substrings).

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
export const DEFAULT_CAREER_GOAL = 'a college-bound high-school student';

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

/** Extract the assistant text from a Bedrock Anthropic Messages response and parse the JSON array
 *  of suggestions out of it (tolerating ```json fences / surrounding prose). Throws on no array. */
function parseModelSuggestions(decoded: unknown): CertSuggestion[] {
  const content = (decoded as { content?: Array<{ type?: string; text?: string }> })?.content;
  const text = Array.isArray(content)
    ? content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join('\n')
    : '';
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('no JSON array in model output');
  const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!Array.isArray(arr)) throw new Error('model output is not an array');
  return arr.map(toValidatedSuggestion).filter((s): s is CertSuggestion => s !== null);
}

/** Build the prompt instructing the model to return ONLY a JSON array, excluding held certs. */
function buildPrompt(careerGoal: string, existingNames: string[]): string {
  const held = existingNames.length ? existingNames.join(', ') : '(none yet)';
  return [
    `A high-school student is working toward their intended college program. Their stated goal: "${careerGoal}".`,
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
  return async ({ careerGoal, existingNames }) => {
    const modelId = options.modelId ?? process.env.BEDROCK_MODEL_ID;
    if (!modelId) return fallback({ careerGoal, existingNames });
    try {
      // Lazy-require so importing this module (e.g. the route manifest at cold start) never forces
      // the SDK to load until a suggestion is actually requested.
      const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
      const client: BedrockInvoker =
        options.client ?? (new BedrockRuntimeClient({}) as unknown as BedrockInvoker);
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 1024,
            messages: [{ role: 'user', content: buildPrompt(careerGoal, existingNames) }],
          }),
        ),
      });
      const res = await client.send(command);
      if (!res.body) return fallback({ careerGoal, existingNames });
      const decoded = JSON.parse(new TextDecoder().decode(res.body)) as unknown;
      const heldTokenSets = existingNames.map(tokenSet);
      const suggestions = parseModelSuggestions(decoded)
        .filter((s) => notAlreadyHeld(s.name, heldTokenSets))
        .sort((a, b) => a.priority - b.priority);
      return suggestions.length > 0 ? suggestions : fallback({ careerGoal, existingNames });
    } catch {
      return fallback({ careerGoal, existingNames });
    }
  };
}
