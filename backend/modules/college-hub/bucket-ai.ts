// AI admissions-bucket suggestion for a college. Model-only (webSearch:false) — it REASONS over
// numbers we already hydrated (acceptance rate, admitted GPA) against the student's GPA; no web
// search, so it's fast and request-safe. Pure prompt-build + parse; returns undefined on any failure
// or when there's nothing to reason from. Mirrors prep-ai.ts.
// VERIFIED IMPORTS (match prep-ai.ts:14 + bedrock.ts exactly):
import { converseWithSearch, type BedrockInvoker, type WebSearcher } from '../../shared/ai/index.js';
import type { College, Data } from '../../shared/data/index.js';
import { ADMISSION_BUCKETS, type AdmissionBucket } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { HYDRATION_TYPE } from './constants.js'; // NOT './hydration.js' — avoids the import cycle

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

// --- Async generation (SQS worker) --------------------------------------------------------------
// Bucket suggestion is a fast model-only call, but we back-fill it as a fire-and-forget job (from the
// list handler) and refresh it after each hydrate. It REUSES the shared College Hub queue/type with a
// `task:'bucket'` discriminator (the worker routes by message shape — see hydration.manifest.ts), so
// no new plumbing. Prefers the FOCUS queue (interactive lane) so bulk hydration can't starve it.

/** SQS message for a bucket job (shares the College Hub queue/type; `task:'bucket'` selects this path). */
export interface CollegeBucketMessage {
  type: typeof HYDRATION_TYPE;
  collegeId: string;
  task: 'bucket';
  tenantId: string; // MANDATORY — the worker fail-closes any message missing tenantId/studentId to the DLQ
  studentId: string;
}

/** Suggester seam so tests can inject; production builds the model-only Bedrock one. */
export type BucketSuggester = (input: SuggestBucketInput) => Promise<BucketSuggestion | undefined>;

/** Run one bucket job: read the college + student GPA, suggest, merge (preserving user edits). Never
 *  throws. Idempotent — safe to run twice (it just recomputes suggestedBucket*). No-op if gone. It
 *  writes ONLY suggestedBucket* (system fields via mergePreservingUserEdits) — never `bucket`. */
export async function runBucketJob(
  getData: () => Data,
  suggester: BucketSuggester | undefined,
  collegeId: string,
): Promise<void> {
  const data = getData();
  const college = await data.colleges.get(collegeId);
  if (!college) return;
  try {
    const profile = await data.studentProfile.get();
    const run = suggester ?? ((i: SuggestBucketInput) => suggestBucket(i));
    const suggestion = await run({ college, currentGPA: profile?.currentGPA, gpaType: profile?.gpaType });
    // Always record the attempt (system flag) so a permanently-unclassifiable college — no acceptance
    // rate or admitted GPA — isn't re-enqueued by the list back-fill on every poll. On success we also
    // write the suggestion; on an empty result the college stays Unclassified but won't re-fire.
    await data.colleges.mergePreservingUserEdits(collegeId, {
      bucketAttempted: true,
      ...(suggestion
        ? {
            suggestedBucket: suggestion.bucket,
            suggestedBucketRationale: suggestion.rationale,
            suggestedBucketConfidence: suggestion.confidence,
          }
        : {}),
    });
  } catch (err) {
    console.error('college-hub: bucket job failed', err);
  }
}

/** Worker-side handler for a bucket job payload (`{ task: 'bucket', collegeId }`). */
export function makeBucketWorkerHandler(
  getData: () => Data,
  suggester?: BucketSuggester,
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<CollegeBucketMessage>;
    if (msg.task !== 'bucket' || typeof msg.collegeId !== 'string' || !msg.collegeId) return;
    await runBucketJob(getData, suggester, msg.collegeId);
  };
}

/** One seam for "start this bucket job". Production enqueues to SQS; falls back to inline suggestion. */
export type BucketDispatcher = (collegeId: string) => Promise<void>;

/** Minimal structural type of the SQS client (just `send`) — injectable without the SDK class. */
export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface SqsBucketEnqueuerOptions {
  /** Queue URL; defaults to the FOCUS queue, then the shared hydration queue. */
  queueUrl?: string;
  client?: SqsSender;
  /** Dispatcher used when enqueue can't proceed; defaults to running the job inline. */
  fallback?: BucketDispatcher;
}

/** Enqueue a bucket job to the FOCUS queue (falls back to the hydration queue, then inline). */
export function makeSqsBucketEnqueuer(
  getData: () => Data,
  options: SqsBucketEnqueuerOptions = {},
): BucketDispatcher {
  const fallback = options.fallback ?? ((collegeId: string) => runBucketJob(getData, undefined, collegeId));
  return async (collegeId) => {
    const queueUrl = options.queueUrl ?? process.env.FOCUS_QUEUE_URL ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback(collegeId);
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: HYDRATION_TYPE,
            collegeId,
            task: 'bucket',
            tenantId: currentTenantId(),
            studentId: currentStudentId(),
          } as CollegeBucketMessage),
        }),
      );
    } catch {
      await fallback(collegeId);
    }
  };
}
