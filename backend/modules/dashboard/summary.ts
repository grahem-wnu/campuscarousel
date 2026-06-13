// Pure aggregation for the dashboard — read-only roll-ups over the shared data layer. Framework- and
// AWS-free so it unit-tests for real. Visibility filtering is the CALLER's job (the handler runs
// activities/experiences through filterForRequester before calling these), so a private entry never
// reaches a parent's widgets. Date-relative math takes `todayIso` explicitly for determinism.

import type {
  Activity,
  Certification,
  ExperienceEntry,
  College,
  Course,
  Goal,
  Interview,
  Scholarship,
  ExamScore,
} from '../../shared/data/index.js';
import { collegeDeadlineDate } from '../../shared/college-deadline.js';

const MS_PER_DAY = 86_400_000;
const r2 = (n: number): number => Math.round(n * 100) / 100;

export function daysUntil(dateIso: string, todayIso: string): number | null {
  const t = Date.parse(`${dateIso}T00:00:00Z`);
  const base = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(base)) return null;
  return Math.round((t - base) / MS_PER_DAY);
}

// ---- GPA (from courses) ---------------------------------------------------

export interface Gpa {
  weighted: number | null;
  unweighted: number | null;
  courses: number;
}
export function computeGpa(courses: readonly Course[]): Gpa {
  const graded = courses.filter((c) => c.gradePoints !== undefined && (c.units ?? 0) > 0);
  if (graded.length === 0) return { weighted: null, unweighted: null, courses: 0 };
  let wPts = 0;
  let uPts = 0;
  let units = 0;
  for (const c of graded) {
    const u = c.units!;
    wPts += c.gradePoints! * u;
    uPts += Math.min(c.gradePoints!, 4) * u; // strip the honors/AP bump for an unweighted estimate
    units += u;
  }
  return { weighted: r2(wPts / units), unweighted: r2(uPts / units), courses: graded.length };
}

// ---- Activity summary + streak --------------------------------------------

/** Whole-day index since the Unix epoch for an ISO date (timezone-free). */
function dayIndex(dateIso: string): number | null {
  const ms = Date.parse(`${dateIso}T00:00:00Z`);
  return Number.isNaN(ms) ? null : Math.floor(ms / MS_PER_DAY);
}

export interface ActivitySummary {
  totalCount: number;
  totalHours: number;
  hoursByCategory: Record<string, number>;
  /** Consecutive rolling 7-day windows back from today, each containing ≥1 activity. */
  weeklyStreak: number;
}
export function activitySummary(activities: readonly Activity[], todayIso: string): ActivitySummary {
  const hoursByCategory: Record<string, number> = {};
  let totalHours = 0;
  const days = new Set<number>();
  for (const a of activities) {
    totalHours += a.hours ?? 0;
    if (a.hours) hoursByCategory[a.category] = (hoursByCategory[a.category] ?? 0) + a.hours;
    const d = dayIndex(a.date);
    if (d !== null) days.add(d);
  }
  const today = dayIndex(todayIso);
  let weeklyStreak = 0;
  if (today !== null) {
    for (;;) {
      const end = today - 7 * weeklyStreak;
      let has = false;
      for (let d = end - 6; d <= end; d++) if (days.has(d)) { has = true; break; }
      if (!has) break;
      weeklyStreak += 1;
    }
  }
  return { totalCount: activities.length, totalHours: r2(totalHours), hoursByCategory, weeklyStreak };
}

export function clinicalTotalHours(experiences: readonly ExperienceEntry[]): number {
  return r2(experiences.reduce((s, c) => s + (c.hours ?? 0), 0));
}

// ---- Latest exam ----------------------------------------------------------

export function latestExam(exams: readonly ExamScore[]): { date: string; overallScore: number } | null {
  const scored = exams.filter((t) => t.overallScore !== undefined).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const top = scored[0];
  return top ? { date: top.date, overallScore: top.overallScore! } : null;
}

// ---- Certifications -------------------------------------------------------

export interface CertSummary {
  active: number;
  expiringSoon: number; // within 90 days
  expired: number;
  planned: number;
}
export function certSummary(certs: readonly Certification[], todayIso: string): CertSummary {
  let active = 0;
  let expiringSoon = 0;
  let expired = 0;
  let planned = 0;
  for (const c of certs) {
    const status = c.status ?? (c.dateEarned ? 'active' : 'planned');
    if (status === 'planned' || status === 'in-progress') {
      planned += 1;
      continue;
    }
    const remaining = c.expirationDate ? daysUntil(c.expirationDate, todayIso) : null;
    if (remaining !== null && remaining < 0) expired += 1;
    else if (remaining !== null && remaining <= 90) expiringSoon += 1;
    else active += 1;
  }
  return { active, expiringSoon, expired, planned };
}

// ---- Upcoming deadlines (merged across sources) ---------------------------

export type DeadlineSource = 'college' | 'goal' | 'scholarship' | 'certification';
export interface Deadline {
  source: DeadlineSource;
  label: string;
  date: string;
  daysUntil: number;
}
export function upcomingDeadlines(
  data: { colleges: readonly College[]; goals: readonly Goal[]; scholarships: readonly Scholarship[]; certifications: readonly Certification[] },
  todayIso: string,
  limit = 8,
  graduationYear?: number,
): Deadline[] {
  const out: Deadline[] = [];
  const push = (source: DeadlineSource, label: string, date?: string | null) => {
    if (!date) return;
    const d = daysUntil(date, todayIso);
    if (d === null || d < 0) return;
    out.push({ source, label, date, daysUntil: d });
  };
  for (const c of data.colleges) {
    if (c.status === 'removed') continue;
    // College deadlines are stored as prose; project the month/day onto the student's own cycle.
    push('college', `${c.name}: early action`, collegeDeadlineDate(c.applicationDeadlines?.earlyAction, graduationYear) || null);
    push('college', `${c.name}: regular decision`, collegeDeadlineDate(c.applicationDeadlines?.regularDecision, graduationYear) || null);
    push('college', `${c.name}: program app`, collegeDeadlineDate(c.applicationDeadlines?.programApp, graduationYear) || null);
  }
  for (const g of data.goals) if (g.status !== 'completed' && g.status !== 'dropped') push('goal', g.title, g.targetDate);
  for (const s of data.scholarships) if (s.status !== 'awarded' && s.status !== 'denied' && s.status !== 'expired') push('scholarship', s.name, s.applicationDeadline);
  for (const c of data.certifications) if (c.renewalRequired) push('certification', `${c.name} renewal`, c.expirationDate ?? undefined);
  return out.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, limit);
}

// ---- College status counts ------------------------------------------------

export function collegeCounts(colleges: readonly College[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of colleges) {
    if (c.status === 'removed') continue;
    out[c.status ?? 'researching'] = (out[c.status ?? 'researching'] ?? 0) + 1;
  }
  return out;
}

// ---- Goals ----------------------------------------------------------------

export interface GoalSummary {
  total: number;
  completed: number;
  inProgress: number;
  avgProgress: number | null;
}
export function goalSummary(goals: readonly Goal[]): GoalSummary {
  const active = goals.filter((g) => g.status !== 'dropped');
  const withProgress = active.filter((g) => g.progress !== undefined);
  const avg = withProgress.length ? r2(withProgress.reduce((s, g) => s + g.progress!, 0) / withProgress.length) : null;
  return {
    total: active.length,
    completed: active.filter((g) => g.status === 'completed').length,
    inProgress: active.filter((g) => g.status === 'in-progress').length,
    avgProgress: avg,
  };
}

// ---- Budget + scholarships ------------------------------------------------

export interface BudgetSummary {
  totalBudget: number | null;
  awarded: number;
  scholarshipsApplied: number;
  scholarshipsAwarded: number;
  /** Estimated net cost of top-pick colleges (sum of estimatedCostAfterAid). */
  topPickNetCost: number | null;
}
export function budgetSummary(
  budget: { totalBudget: number } | null,
  scholarships: readonly Scholarship[],
  colleges: readonly College[],
): BudgetSummary {
  const awarded = scholarships.filter((s) => s.status === 'awarded').reduce((s, x) => s + (x.awardedAmount ?? x.amount ?? 0), 0);
  const topCosts = colleges.filter((c) => c.isTopPick && c.estimatedCostAfterAid !== undefined).map((c) => c.estimatedCostAfterAid!);
  return {
    totalBudget: budget?.totalBudget ?? null,
    awarded: r2(awarded),
    scholarshipsApplied: scholarships.filter((s) => ['applied', 'awarded', 'denied'].includes(s.status ?? '')).length,
    scholarshipsAwarded: scholarships.filter((s) => s.status === 'awarded').length,
    topPickNetCost: topCosts.length ? r2(topCosts.reduce((a, b) => a + b, 0)) : null,
  };
}

// ---- Interview readiness (avg mock rating) --------------------------------

export function interviewReadiness(interviews: readonly Interview[]): { avgRating: number | null; answered: number } {
  const ratings = interviews
    .filter((i) => i.type === 'mock-practice')
    .flatMap((i) => (i.questions ?? []).map((q) => q.rating))
    .filter((r): r is number => typeof r === 'number');
  return { avgRating: ratings.length ? r2(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null, answered: ratings.length };
}

// ---- Recent activity feed (already visibility-filtered by the caller) -----

export interface FeedItem {
  date: string;
  title: string;
  category: string;
}
export function recentFeed(activities: readonly Activity[], limit = 6): FeedItem[] {
  return activities
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map((a) => ({ date: a.date, title: a.title, category: a.category }));
}
