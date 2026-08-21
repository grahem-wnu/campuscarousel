// Async execution for College Scholarship Research: job runners, SQS enqueuers, and the worker-side
// handlers. Both jobs are web-grounded (60-180s), far past API Gateway's ~30s ceiling, so the API
// marks a status 'in-progress', enqueues, and returns 202; the 300s worker does the work and writes
// the result back; the frontend polls until the status settles. Same shape as college-hub prep and
// the essay-coach jobs.
//
// Queue: SCHOLARSHIP_QUEUE_URL, else FOCUS_QUEUE_URL (the interactive lane — web search is already
// enabled there), else HYDRATION_QUEUE_URL. The first is unset today, so no new infra is needed; set
// it later to move these onto a dedicated lane without a code change. Any enqueue failure degrades
// to running the job inline so a click still produces a result.

import type { CollegeScholarship, Data } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import { makeBedrockResearcher, makeBedrockSearcher } from './ai.js';
import type { ScholarshipResearcher } from './research.js';
import { nameKey, type FoundScholarship, type ScholarshipSearcher } from './search.js';
import type { SearchCategory } from './schema.js';

/** SQS message `type` for every job in this module; `kind` selects search vs research. */
export const SCHOLARSHIP_TYPE = 'college-scholarship';

export interface SearchMessage {
  type: typeof SCHOLARSHIP_TYPE;
  kind: 'search';
  collegeId: string;
  tenantId: string;
  studentId: string;
}

export interface ResearchMessage {
  type: typeof SCHOLARSHIP_TYPE;
  kind: 'research';
  collegeId: string;
  scholarshipId: string;
  tenantId: string;
  studentId: string;
}

/** One seam for "start this job". Production enqueues to SQS; tests/no-queue run inline. */
export type SearchDispatcher = (collegeId: string) => Promise<void>;
export type ResearchDispatcher = (collegeId: string, scholarshipId: string) => Promise<void>;

/** The student's intended majors, [] on any miss — used to aim both prompts at the right program. */
async function majorsOf(data: Data): Promise<{ majors: string[]; gradYear?: number }> {
  try {
    const profile = await data.studentProfile.get();
    return { majors: profile?.intendedMajors ?? [], gradYear: profile?.graduationYear };
  } catch {
    return { majors: [] };
  }
}

/** Which stored categories a search run is allowed to prune. 'other' is the parser's fallback
 *  bucket, so every run owns it; otherwise a run only prunes what it actually looked for (an
 *  athletic search must never delete the academic awards a previous run found). */
export function coveredCategories(category: SearchCategory): Set<string> {
  if (category === 'all') return new Set(['academic', 'athletic', 'other']);
  return new Set([category, 'other']);
}

/**
 * Reconcile a fresh set of search results against what's already stored for this college.
 *
 * - An award we already have (matched on normalized name) is refreshed with the new facts but KEEPS
 *   its dossier — re-searching must never destroy research a family already ran.
 * - A newly-found award is added.
 * - A stored award in this run's categories that was NOT re-found is deleted, unless it carries a
 *   dossier (or one is in flight), in which case it stays.
 *
 * `prune` is the whole reason this takes a flag. A BROAD sweep is authoritative for its categories,
 * so clearing out what it no longer finds keeps the list honest. A TARGETED search ("soccer") is
 * not: it only ever looked for one thing, so anything it didn't return is simply outside its scope,
 * not stale. Pruning on a targeted search would mean typing "soccer" silently deleted the merit
 * awards a previous sweep found — searches must accumulate, never quietly destroy.
 *
 * Returns the number of awards the college now has.
 */
export async function reconcileResults(
  data: Data,
  collegeId: string,
  found: FoundScholarship[],
  category: SearchCategory,
  prune = true,
): Promise<number> {
  const existing = await data.collegeScholarships.list(collegeId);
  const byKey = new Map<string, CollegeScholarship>();
  for (const item of existing) byKey.set(nameKey(item.name), item);

  const foundKeys = new Set<string>();
  for (const award of found) {
    const key = nameKey(award.name);
    if (!key) continue;
    foundKeys.add(key);
    const prior = byKey.get(key);
    if (prior) {
      // Refresh the search-level facts; `research`/`researchStatus`/`researchedAt` are untouched.
      await data.collegeScholarships.update(collegeId, prior.scholarshipId, award);
    } else {
      await data.collegeScholarships.add(collegeId, award);
    }
  }

  const covered = coveredCategories(category);
  for (const item of prune ? existing : []) {
    const key = nameKey(item.name);
    if (foundKeys.has(key)) continue;
    if (!covered.has(item.category ?? 'other')) continue; // a different search's territory
    if (item.research || item.researchStatus === 'in-progress' || item.researchStatus === 'pending') continue;
    await data.collegeScholarships.delete(collegeId, item.scholarshipId);
  }

  const after = await data.collegeScholarships.list(collegeId);
  return after.length;
}

/** Flatten several sweeps into one list, dropping awards a later sweep repeats. The academic and
 *  athletic passes overlap on things like scholar-athlete awards, so without this an "All" search
 *  would list them twice. First occurrence wins, so the academic pass's richer copy is kept. */
export function mergeFound(batches: FoundScholarship[][]): FoundScholarship[] {
  const out: FoundScholarship[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    for (const award of batch) {
      const key = nameKey(award.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(award);
    }
  }
  return out;
}

/** Run one search job: sweep the web for this college's awards and reconcile them into the college.
 *  Never throws — a failure lands as `status: 'failed'` on the search singleton, which the UI shows
 *  with a retry. No-op when the college is gone (deleted while the job was queued). */
export async function runSearchJob(
  getData: () => Data,
  searcher: ScholarshipSearcher | undefined,
  collegeId: string,
): Promise<void> {
  const data = getData();
  const college = await data.colleges.get(collegeId);
  if (!college) return;
  try {
    const state = await data.collegeScholarshipSearch.get(collegeId);
    const category = (state?.category ?? 'all') as SearchCategory;
    const query = state?.query;
    const { majors } = await majorsOf(data);
    const run = searcher ?? makeBedrockSearcher();
    const common = { collegeName: college.name, query, sport: state?.sport, majors, state: college.state };

    // A broad "All" sweep runs the academic and athletic searches as TWO CONCURRENT calls rather
    // than one combined one. A single combined sweep reliably drifted academic in practice: a
    // school's merit awards are all over its financial-aid pages, while athletic aid lives on a
    // separate athletics site under different rules, so one search that could satisfy itself with
    // either would come back academic-only. Two scoped searches each have to answer for their own
    // half. They run in parallel, so this costs tokens but not wall-clock — important, because the
    // worker still has to finish inside its 300s timeout.
    const found =
      category === 'all' && !query
        ? mergeFound(
            await Promise.all([run({ ...common, category: 'academic' }), run({ ...common, category: 'athletic' })]),
          )
        : await run({ ...common, category });
    if (found.length === 0) {
      // A genuinely empty sweep and a broken model call are indistinguishable from here, and both
      // are best surfaced the same way: complete, zero found, with a retry available.
      await data.collegeScholarshipSearch.patch(collegeId, {
        status: 'complete',
        found: 0,
        lastRunAt: new Date().toISOString(),
        error: undefined,
      });
      return;
    }
    // Only a broad sweep is authoritative enough to prune; a targeted search only adds. See
    // reconcileResults.
    const total = await reconcileResults(data, collegeId, found, category, !query);
    await data.collegeScholarshipSearch.patch(collegeId, {
      status: 'complete',
      found: total,
      lastRunAt: new Date().toISOString(),
      error: undefined,
    });
  } catch (err) {
    console.error('[college-scholarships] search job failed', collegeId, err);
    await data.collegeScholarshipSearch
      .patch(collegeId, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'scholarship search failed',
      })
      .catch(() => {});
  }
}

/** Run one research job: build the deep dossier for a single award and write it back, flipping
 *  `researchStatus` so the polling UI settles. Never throws; no-op if the award or college is gone. */
export async function runResearchJob(
  getData: () => Data,
  researcher: ScholarshipResearcher | undefined,
  collegeId: string,
  scholarshipId: string,
): Promise<void> {
  const data = getData();
  const college = await data.colleges.get(collegeId);
  const scholarship = await data.collegeScholarships.get(collegeId, scholarshipId);
  if (!college || !scholarship) return;
  try {
    const { majors, gradYear } = await majorsOf(data);
    const research = await (researcher ?? makeBedrockResearcher())({
      collegeName: college.name,
      scholarship,
      majors,
      gradYear,
    });
    await data.collegeScholarships.update(
      collegeId,
      scholarshipId,
      research
        ? { research, researchStatus: 'complete', researchedAt: new Date().toISOString() }
        : { researchStatus: 'failed' },
    );
  } catch (err) {
    console.error('[college-scholarships] research job failed', collegeId, scholarshipId, err);
    await data.collegeScholarships.update(collegeId, scholarshipId, { researchStatus: 'failed' }).catch(() => {});
  }
}

// --- worker handlers ----------------------------------------------------------------------------

/** Worker-side handler for both job kinds, routed by `kind`. Registered under one message `type` in
 *  hydration.manifest.ts, mirroring how college-hub routes its several async jobs. */
export function makeWorkerHandler(
  getData: () => Data,
  deps: { searcher?: ScholarshipSearcher; researcher?: ScholarshipResearcher } = {},
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    // Decoded as the union's common shape, NOT `Partial<Search & Research>` — intersecting the two
    // disjoint `kind` literals collapses the whole type to `never`.
    const msg = (payload ?? {}) as Partial<Omit<SearchMessage, 'kind'> & Omit<ResearchMessage, 'kind'>> & {
      kind?: SearchMessage['kind'] | ResearchMessage['kind'];
    };
    if (typeof msg.collegeId !== 'string' || !msg.collegeId) return;
    if (msg.kind === 'research') {
      if (typeof msg.scholarshipId !== 'string' || !msg.scholarshipId) return;
      return runResearchJob(getData, deps.researcher, msg.collegeId, msg.scholarshipId);
    }
    if (msg.kind === 'search') return runSearchJob(getData, deps.searcher, msg.collegeId);
  };
}

// --- enqueuers ----------------------------------------------------------------------------------

/** Minimal structural type of the SQS client (just `send`) — injectable without the SDK class. */
export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export interface EnqueuerOptions {
  /** Defaults to SCHOLARSHIP_QUEUE_URL, then FOCUS_QUEUE_URL, then HYDRATION_QUEUE_URL. */
  queueUrl?: string;
  client?: SqsSender;
}

/** The queue this module's jobs go to, in preference order. */
function resolveQueueUrl(explicit?: string): string | undefined {
  return explicit ?? process.env.SCHOLARSHIP_QUEUE_URL ?? process.env.FOCUS_QUEUE_URL ?? process.env.HYDRATION_QUEUE_URL;
}

/** Send one job message, stamped with the caller's tenant + student so the worker can re-enter the
 *  right scope. Throws on any send failure so the caller can fall back to inline execution. */
async function send(queueUrl: string, body: Record<string, unknown>, client?: SqsSender): Promise<void> {
  const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
  const sqs: SqsSender = client ?? (new SQSClient({}) as unknown as SqsSender);
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        type: SCHOLARSHIP_TYPE,
        ...body,
        tenantId: currentTenantId(),
        studentId: currentStudentId(),
      }),
    }),
  );
}

/** Production search dispatcher: enqueue, falling back to inline execution when there's no queue or
 *  the send fails. */
export function makeSqsSearchEnqueuer(
  getData: () => Data,
  options: EnqueuerOptions & { searcher?: ScholarshipSearcher; fallback?: SearchDispatcher } = {},
): SearchDispatcher {
  const fallback = options.fallback ?? ((collegeId: string) => runSearchJob(getData, options.searcher, collegeId));
  return async (collegeId) => {
    const queueUrl = resolveQueueUrl(options.queueUrl);
    if (!queueUrl) return fallback(collegeId);
    try {
      await send(queueUrl, { kind: 'search', collegeId }, options.client);
    } catch (err) {
      console.error('[college-scholarships] search enqueue failed, running inline', collegeId, err);
      await fallback(collegeId);
    }
  };
}

/** Production research dispatcher: same contract, for a single award. */
export function makeSqsResearchEnqueuer(
  getData: () => Data,
  options: EnqueuerOptions & { researcher?: ScholarshipResearcher; fallback?: ResearchDispatcher } = {},
): ResearchDispatcher {
  const fallback =
    options.fallback ?? ((collegeId: string, scholarshipId: string) => runResearchJob(getData, options.researcher, collegeId, scholarshipId));
  return async (collegeId, scholarshipId) => {
    const queueUrl = resolveQueueUrl(options.queueUrl);
    if (!queueUrl) return fallback(collegeId, scholarshipId);
    try {
      await send(queueUrl, { kind: 'research', collegeId, scholarshipId }, options.client);
    } catch (err) {
      console.error('[college-scholarships] research enqueue failed, running inline', collegeId, scholarshipId, err);
      await fallback(collegeId, scholarshipId);
    }
  };
}
