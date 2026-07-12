// Async "how & where to get this certification" research.
//
// Finding the official issuer, the path to obtain a cert, and — crucially — specific local providers
// near the student is a web-grounded, multi-round Bedrock call that can blow past API Gateway's hard
// ~30s integration ceiling. So the handler creates a `CertGuidanceJob` and enqueues a `cert-guidance`
// message; this runs on the shared 300s SQS worker (same path as college hydration / benchmark
// research) and writes the result back, and the frontend polls until it settles.
//
// The prompt builder + parser are pure (unit-tested with an injected invoker). The Bedrock binding
// uses the shared web-grounded call site (`converseWithSearch`): with AI_WEB_SEARCH on (it is, on the
// worker) the model can search for real nearby providers; off/unavailable it still returns general
// guidance from model knowledge (minus the local list) — graceful degradation, never a hard failure.

import { converseWithSearch, type BedrockInvoker, type WebSearcher } from '../../shared/ai/index.js';
import { promptLiteral } from '../../shared/ai/index.js';
import type { CertGuidanceResult, Data } from '../../shared/data/index.js';

/** SQS message `type` discriminator for a cert-guidance research job. */
export const CERT_GUIDANCE_TYPE = 'cert-guidance';

export interface CertGuidanceMessage {
  type: typeof CERT_GUIDANCE_TYPE;
  jobId: string;
}

/** Researches "how & where to get" a cert for a student in `location`. Injectable for tests. */
export type CertGuidanceResearcher = (input: {
  certName: string;
  location?: string;
}) => Promise<CertGuidanceResult>;

/** One seam for "research this guidance job". Production = SQS enqueue; tests/no-queue = inline. */
export type GuidanceDispatcher = (jobId: string) => Promise<void>;

const str = (v: unknown, max = 2000): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
const httpUrl = (v: unknown): string | undefined => {
  const s = str(v, 2000);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
};

/** Coerce the model's local-provider list, keeping only entries with a real name (max 6). */
function parseProviders(v: unknown): CertGuidanceResult['localProviders'] {
  if (!Array.isArray(v)) return undefined;
  const out: NonNullable<CertGuidanceResult['localProviders']> = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const name = str(o.name, 200);
    if (!name) continue;
    out.push({ name, detail: str(o.detail, 400), url: httpUrl(o.url) });
    if (out.length >= 6) break;
  }
  return out.length ? out : undefined;
}

/** Pull the first JSON object out of model text (tolerating prose / code fences) and coerce it into a
 *  CertGuidanceResult. Returns an empty object (not throwing) when nothing parseable is found, so the
 *  job still completes with whatever the model gave. */
export function parseGuidance(text: string): CertGuidanceResult {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return {};
  let o: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    o = parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {
    officialUrl: httpUrl(o.officialUrl),
    howToGet: str(o.howToGet, 2000),
    prerequisites: str(o.prerequisites, 1000),
    typicalCost: num(o.typicalCost),
    renewalFrequency: str(o.renewalFrequency, 120),
    localProviders: parseProviders(o.localProviders),
  };
}

/** Build the research prompt. `certName`/`location` are user/profile data — sanitized before
 *  interpolation. Asks for ONE JSON object so the parser is deterministic. */
export function buildGuidancePrompt(certName: string, location?: string): string {
  const near = location
    ? `The student is located in ${promptLiteral(location)}. Find 2–4 SPECIFIC nearby or online providers (training centers, community colleges, Red Cross/AHA chapters, hospitals) where they could realistically obtain it — prefer ones near that location.`
    : 'List 2–4 well-known national providers where it can be obtained (in person or online).';
  return [
    `A high-school student wants to obtain the certification: "${promptLiteral(certName)}".`,
    'Explain how and where to get it. Use web search for the official issuer and for real providers.',
    near,
    'Respond with ONLY a JSON object (no prose, no code fences):',
    '{"officialUrl": string (the official issuer/registration URL),',
    '"howToGet": string (2–3 sentences on the path: format, what to do),',
    '"prerequisites": string (eligibility/prereqs, or "" if none),',
    '"typicalCost": number (USD, 0 if free),',
    '"renewalFrequency": string (e.g. "Every 2 years", or "" if it does not expire),',
    '"localProviders": [{"name": string, "detail": string (city/format), "url": string}]}.',
  ].join('\n');
}

/** Run one guidance job: fetch it, research, write the result back, mark complete. No-op if the job is
 *  gone; a genuine failure marks it `failed` (surfaced via polling) rather than throwing — the request
 *  that enqueued this has already returned. */
export async function researchGuidanceJob(
  getData: () => Data,
  researcher: CertGuidanceResearcher,
  jobId: string,
): Promise<void> {
  const data = getData();
  const job = await data.certGuidanceJobs.get(jobId);
  if (!job) return;
  try {
    const result = await researcher({ certName: job.certName, location: job.location });
    await data.certGuidanceJobs.update(jobId, { status: 'complete', result });
  } catch (err) {
    console.error('[cert-guidance] research failed', jobId, err);
    await data.certGuidanceJobs.update(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'guidance research failed',
    });
  }
}

/** Inline dispatcher — research now, within the call. Used by tests and as the no-queue fallback. */
export function makeInlineDispatcher(
  getData: () => Data,
  researcher: CertGuidanceResearcher,
): GuidanceDispatcher {
  return (jobId) => researchGuidanceJob(getData, researcher, jobId);
}

/** SQS worker-side handler for the shared `hydrationRegistry` (payload → Promise<void>). */
export function makeWorkerHandler(
  getData: () => Data,
  researcher: CertGuidanceResearcher,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<CertGuidanceMessage>;
    if (typeof msg.jobId !== 'string' || !msg.jobId) return;
    await researchGuidanceJob(getData, researcher, msg.jobId);
  };
}

/** Production researcher: a web-grounded `converseWithSearch` call, parsed into a CertGuidanceResult.
 *  Injectable invoker/searcher/flag for tests; in prod it uses the real SDK client + Tavily, gated by
 *  AI_WEB_SEARCH. Returns `{}` (not a throw) when the model id is unconfigured so the job still
 *  completes cleanly with an empty result. */
export function makeBedrockGuidanceResearcher(
  options: { invoker?: BedrockInvoker; searcher?: WebSearcher; webSearch?: boolean; modelId?: string } = {},
): CertGuidanceResearcher {
  return async ({ certName, location }) => {
    const modelId = options.modelId ?? process.env.BEDROCK_MODEL_ID;
    if (!modelId) return {};
    const { text } = await converseWithSearch(buildGuidancePrompt(certName, location), {
      modelId,
      maxTokens: 1200,
      temperature: 0.3,
      invoker: options.invoker,
      searcher: options.searcher,
      webSearch: options.webSearch,
    });
    return parseGuidance(text);
  };
}
