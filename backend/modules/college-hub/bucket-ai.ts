// AI admissions-bucket suggestion for a college. Model-only (webSearch:false) — it REASONS over
// numbers we already hydrated (acceptance rate, admitted GPA) against the student's GPA; no web
// search, so it's fast and request-safe. Pure prompt-build + parse; returns undefined on any failure
// or when there's nothing to reason from. Mirrors prep-ai.ts.
// VERIFIED IMPORTS (match prep-ai.ts:14 + bedrock.ts exactly):
import { converseWithSearch, type BedrockInvoker, type WebSearcher } from '../../shared/ai/index.js';
import type { College } from '../../shared/data/index.js';
import { ADMISSION_BUCKETS, type AdmissionBucket } from '../../shared/data/index.js';

export interface BucketSuggestion {
  bucket: AdmissionBucket;
  rationale: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface SuggestBucketInput {
  college: Pick<College, 'name' | 'acceptanceRateProgram' | 'acceptanceRateUniversity' | 'avgGPAAdmitted' | 'isDirectAdmit'>;
  currentGPA?: number;
  gpaType?: 'weighted' | 'unweighted';
}

export interface BucketAiOptions {
  modelId?: string;
  invoker?: BedrockInvoker;   // NOT `unknown` — must match converseWithSearch's option type (compile error otherwise)
  searcher?: WebSearcher;
}

const CONFIDENCES = ['low', 'medium', 'high'] as const;

/** Strict parse of the model's JSON. Returns undefined on any shape/enum violation. */
export function parseBucketSuggestion(text: string): BucketSuggestion | undefined {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return undefined;
    const raw = JSON.parse(text.slice(start, end + 1));
    if (!ADMISSION_BUCKETS.includes(raw.bucket)) return undefined;
    if (!CONFIDENCES.includes(raw.confidence)) return undefined;
    if (typeof raw.rationale !== 'string' || !raw.rationale.trim()) return undefined;
    return { bucket: raw.bucket, rationale: raw.rationale.trim().slice(0, 300), confidence: raw.confidence };
  } catch {
    return undefined;
  }
}

export function buildBucketPrompt(input: SuggestBucketInput): string {
  const { college, currentGPA, gpaType } = input;
  const gpaLine = currentGPA != null
    ? `The student's current GPA is ${currentGPA} (${gpaType ?? 'unweighted'}).`
    : `The student's GPA is NOT on file — reason from the college's selectivity alone and set confidence "low".`;
  return [
    `Classify how likely THIS student is to be admitted to this college, as exactly one of: reach, target, safety.`,
    gpaLine,
    `College: ${college.name}.`,
    `Program acceptance rate: ${college.acceptanceRateProgram ?? 'unknown'}.`,
    `University acceptance rate: ${college.acceptanceRateUniversity ?? 'unknown'}.`,
    `Average GPA of admitted students: ${college.avgGPAAdmitted ?? 'unknown'}.`,
    college.isDirectAdmit ? `This is a direct-admit program.` : ``,
    `Guidance: "safety" = high acceptance rate (~>60%) AND the student's GPA at or above the admitted average.`,
    `"reach" = low acceptance rate (~<25%) OR the student's GPA clearly below the admitted average.`,
    `"target" = the student's stats are near the admitted profile with moderate selectivity.`,
    `The rates/GPAs above may be prose like "under 20%" — interpret them; do not expect clean numbers.`,
    `Respond with ONLY a JSON object: {"bucket":"reach|target|safety","rationale":"<=1 sentence citing the numbers","confidence":"low|medium|high"}.`,
  ].filter(Boolean).join('\n');
}

/** Suggest a bucket. Short-circuits to undefined when there is nothing to reason from (no acceptance
 *  rate AND no admitted GPA). Never throws. */
export async function suggestBucket(
  input: SuggestBucketInput,
  options: BucketAiOptions = {},
): Promise<BucketSuggestion | undefined> {
  const { college } = input;
  if (!college.acceptanceRateProgram && !college.acceptanceRateUniversity && !college.avgGPAAdmitted) {
    return undefined;
  }
  try {
    const { text } = await converseWithSearch(buildBucketPrompt(input), {
      feature: 'college-bucket',
      modelId: options.modelId,
      invoker: options.invoker,
      searcher: options.searcher,
      webSearch: false,
      maxTokens: 400,
    });
    return parseBucketSuggestion(text);
  } catch (err) {
    console.error('college-hub: AI bucket suggestion failed', err);
    return undefined;
  }
}
