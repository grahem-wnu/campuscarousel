// Backgrounded student seeding for the FTUE. When a family finishes onboarding we want them on the
// dashboard + tour IMMEDIATELY — not staring at a spinner while two AI calls + ~12 college creations +
// their hydrate/asset dispatches run (30-60s, and over the API's 30s request budget). So POST
// /onboarding/finish saves the profile and ENQUEUES an `onboarding-seed` job; this module runs the
// actual seeding on the async worker (the dashboard already shows hydration progress as it fills in).
// Degrades to an inline run when no queue is configured (tests/local), so the flow still works offline.

import type { Data, StudentProfile } from '../../shared/data/index.js';
import { currentStudentId, currentTenantId } from '../../shared/tenant/index.js';
import type { GoalSuggester } from '../goal-tracker/suggester.js';
import type { CollegeSeeder } from './ai.js';

export const SEED_TYPE = 'onboarding-seed';

/** A college job dispatcher (hydration or assets) — `(collegeId) => Promise<void>`. */
type CollegeJobDispatcher = (collegeId: string) => Promise<void>;

export interface SeedDeps {
  getData: () => Data;
  /** Starter-goal suggester (model-only). */
  suggester: GoalSuggester;
  /** Names a few starter colleges for the major (model-only). */
  collegeSeeder: CollegeSeeder;
  /** Kick off text hydration for a newly-seeded college. */
  hydrateDispatch: CollegeJobDispatcher;
  /** Kick off imagery/assets for a newly-seeded college. */
  assetsDispatch: CollegeJobDispatcher;
}

export interface SeedResult {
  goalsCreated: number;
  collegesCreated: number;
}

/**
 * Seed a freshly-onboarded student: a few starter goals + starter colleges (with hydrate/assets
 * dispatched) + the canonical budget. Reads the already-saved profile from the active student context.
 * Every step is best-effort — the family can add any of these later — so a failure in one never blocks
 * the others or throws. Returns counts (used by the inline path's tests).
 */
export async function seedStudent(deps: SeedDeps, createdBy = 'system'): Promise<SeedResult> {
  const { getData, suggester, collegeSeeder, hydrateDispatch, assetsDispatch } = deps;
  const data = getData();
  const profile: StudentProfile | null = await data.studentProfile.get();
  const majors = profile?.intendedMajors ?? [];

  // Starter goals (best-effort, model-only).
  let goalsCreated = 0;
  try {
    const suggestions = await suggester.suggest(
      {
        careerGoal: profile?.careerGoal,
        gradeLevel: profile?.graduationYear ? `Class of ${profile.graduationYear}` : undefined,
        count: 3,
      },
      majors,
    );
    for (const s of suggestions.slice(0, 3)) {
      await data.goals.create({
        title: s.title,
        description: s.description,
        category: s.category,
        period: s.period,
        milestones: (s.milestones ?? []).map((label, i) => ({ id: `ms-${i}`, label, completed: false })),
        createdBy,
      } as Parameters<Data['goals']['create']>[0]);
      goalsCreated++;
    }
  } catch {
    /* seeding is non-fatal — the family can add goals later */
  }

  // Starter colleges + hydration (best-effort). Names model-only; the async pipeline fills tuition/
  // deadlines/imagery. Skips any name already present (idempotent across re-runs).
  let collegesCreated = 0;
  try {
    const suggestions = await collegeSeeder(majors, profile?.location ?? undefined, profile?.collegesOfInterest ?? []);
    const existing = await data.colleges.list();
    const seen = new Set(existing.map((c) => c.name.trim().toLowerCase()));
    for (const s of suggestions.slice(0, 12)) {
      if (seen.has(s.name.trim().toLowerCase())) continue;
      seen.add(s.name.trim().toLowerCase());
      const created = await data.colleges.create({
        name: s.name,
        state: s.state,
        status: 'researching',
        addedBy: 'ai-discovered',
        userEdited: [],
        hydrationStatus: 'in-progress',
        assetsStatus: 'in-progress',
      } as Parameters<Data['colleges']['create']>[0]);
      await hydrateDispatch(created.collegeId);
      await assetsDispatch(created.collegeId);
      collegesCreated++;
    }
  } catch {
    /* college seeding is non-fatal — the family can run the College Finder later */
  }

  // Canonical budget so it reaches the dashboard + FinAid (profile.budget alone doesn't).
  if (profile?.budget?.total != null) {
    try {
      const existingBudget = await data.budget.get();
      if (existingBudget) {
        await data.budget.update({ totalBudget: profile.budget.total });
      } else {
        await data.budget.put({ totalBudget: profile.budget.total } as Parameters<Data['budget']['put']>[0]);
      }
    } catch {
      /* non-fatal — the family can set the budget on the FinAid page */
    }
  }

  return { goalsCreated, collegesCreated };
}

export interface SeedMessage {
  type: typeof SEED_TYPE;
  tenantId: string;
  studentId: string;
}

/** Worker-side handler for an `onboarding-seed` message. Runs inside the message's tenant/student
 *  context (the worker sets it), so `seedStudent` resolves the right student. */
export function makeSeedWorkerHandler(deps: SeedDeps): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<SeedMessage>;
    if (msg.type !== SEED_TYPE) return;
    await seedStudent(deps);
  };
}

export interface SqsSender {
  send(command: unknown): Promise<unknown>;
}

export type SeedDispatcher = () => Promise<void>;

export interface SeedEnqueuerOptions {
  queueUrl?: string;
  client?: SqsSender;
  fallback?: SeedDispatcher;
}

/** A dispatcher that enqueues an `onboarding-seed` job for the SQS worker, or runs the seed inline
 *  if no queue is configured / the send fails (tests/local). Uses the shared hydration queue. */
export function makeSqsSeedEnqueuer(deps: SeedDeps, options: SeedEnqueuerOptions = {}): SeedDispatcher {
  const fallback = options.fallback ?? (async () => void (await seedStudent(deps)));
  return async () => {
    const queueUrl = options.queueUrl ?? process.env.HYDRATION_QUEUE_URL;
    if (!queueUrl) return fallback();
    try {
      const { SQSClient, SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const client: SqsSender = options.client ?? (new SQSClient({}) as unknown as SqsSender);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: SEED_TYPE,
            tenantId: currentTenantId(),
            studentId: currentStudentId(),
          }),
        }),
      );
    } catch {
      await fallback();
    }
  };
}
