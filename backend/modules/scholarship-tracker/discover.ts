// Pure prompt builder + result parser for AI scholarship discovery (POST /scholarships/discover).
// The synchronous Bedrock binding that uses these lives in ai.ts (`makeBedrockDiscoverer`); keeping
// the prompt/parse here pure makes them unit-testable with no AWS. The `ScholarshipDiscoverer`
// interface is the injection seam the handlers consume.

import { TYPES, type DiscoverInput } from './schema.js';

/** One AI-discovered scholarship candidate — a strict subset of the createable shape so a selected
 *  result drops straight into POST /scholarships/bulk-add. Nothing here is persisted by /discover. */
export interface DiscoveredScholarship {
  name: string;
  provider?: string;
  amount?: number;
  amountDescription?: string;
  type?: (typeof TYPES)[number];
  eligibility?: string[];
  applicationDeadline?: string;
  applicationUrl?: string;
}

export interface ScholarshipDiscoverer {
  discover(input: DiscoverInput): Promise<DiscoveredScholarship[]>;
}

const isType = (v: unknown): v is DiscoveredScholarship['type'] =>
  typeof v === 'string' && (TYPES as readonly string[]).includes(v);

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Build the web-search discovery prompt from the search context. Deterministic + side-effect free. */
export function buildDiscoverPrompt(input: DiscoverInput): string {
  const count = input.count ?? 8;
  const lines: string[] = [
    'You are helping a student find scholarships to fund their intended college degree.',
    `Use web search to find ${count} real, currently-open scholarships. Do not invent any.`,
  ];
  if (input.query) lines.push(`Focus: ${input.query}.`);
  if (input.type) lines.push(`Prefer type: ${input.type}.`);
  if (input.state) lines.push(`Include ${input.state} state-specific scholarships.`);
  if (input.linkedColleges?.length) {
    lines.push(`Include scholarships specific to: ${input.linkedColleges.join(', ')}.`);
  }
  lines.push(
    `Each scholarship's type must be one of: ${TYPES.join(', ')}.`,
    'Return ONLY a JSON array, no prose. Each element:',
    '{"name":string,"provider":string,"amount":number,"amountDescription":string,"type":string,' +
      '"eligibility":string[],"applicationDeadline":"YYYY-MM-DD","applicationUrl":string}',
  );
  return lines.join('\n');
}

/**
 * Coerce raw model output into clean candidates: tolerate a JSON array embedded in prose, drop
 * anything without a name, clamp the shape (unknown type/bad date → omitted). Returns [] on
 * unparseable output rather than throwing.
 */
export function parseDiscoverResults(raw: string, limit = 20): DiscoveredScholarship[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: DiscoveredScholarship[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    const s: DiscoveredScholarship = { name: name.slice(0, 300) };
    if (typeof r.provider === 'string' && r.provider.trim()) s.provider = r.provider.trim().slice(0, 300);
    if (typeof r.amount === 'number' && Number.isFinite(r.amount) && r.amount >= 0) s.amount = r.amount;
    if (typeof r.amountDescription === 'string' && r.amountDescription.trim()) {
      s.amountDescription = r.amountDescription.trim().slice(0, 300);
    }
    if (isType(r.type)) s.type = r.type;
    if (Array.isArray(r.eligibility)) {
      const e = r.eligibility
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim().slice(0, 500))
        .slice(0, 100);
      if (e.length) s.eligibility = e;
    }
    if (typeof r.applicationDeadline === 'string' && isoDate.test(r.applicationDeadline)) {
      s.applicationDeadline = r.applicationDeadline;
    }
    if (typeof r.applicationUrl === 'string' && /^https?:\/\//.test(r.applicationUrl)) {
      s.applicationUrl = r.applicationUrl.slice(0, 2000);
    }
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
