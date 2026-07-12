// Derived application overview — a read-only tracker assembled from existing entities (colleges +
// essays + exams), so it needs no new storage. Per active college: nearest deadline + countdown, essay
// progress, and whether an exam score exists. The mutable per-application fields the spec also lists
// (transcript-sent, rec-board slots, SAT/ACT/AP tracking) need a dedicated APPLICATION# entity that
// the frozen data layer lacks — escalated on the checkpoint.

import type { College, Essay, ExamScore } from '../../shared/data/index.js';

const MS_PER_DAY = 86_400_000;

export interface ApplicationRow {
  collegeId: string;
  name: string;
  status?: College['status'];
  programType?: College['programType'];
  isTopPick?: boolean;
  nextDeadline: { label: string; date: string } | null;
  daysUntilDeadline: number | null;
  essays: { total: number; final: number; statuses: string[] };
  hasExamScore: boolean;
}

function daysUntil(dateIso: string, todayIso: string): number | null {
  const t = Date.parse(`${dateIso}T00:00:00Z`);
  const base = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(base)) return null;
  return Math.round((t - base) / MS_PER_DAY);
}

/** The soonest upcoming application deadline for a college (future-or-today preferred). */
function nextDeadline(college: College, todayIso: string): { label: string; date: string } | null {
  const d = college.applicationDeadlines;
  if (!d) return null;
  const candidates = [
    d.earlyAction ? { label: 'Early action', date: d.earlyAction } : null,
    d.regularDecision ? { label: 'Regular decision', date: d.regularDecision } : null,
    d.programApp ? { label: 'Program app', date: d.programApp } : null,
  ].filter((x): x is { label: string; date: string } => x !== null);
  if (candidates.length === 0) return null;
  const upcoming = candidates
    .filter((c) => (daysUntil(c.date, todayIso) ?? -1) >= 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (upcoming.length) return upcoming[0]!;
  // all past — show the latest past one
  return candidates.sort((a, b) => (a.date > b.date ? -1 : 1))[0]!;
}

/** Build the overview rows for the active colleges, soonest deadline first. */
export function buildOverview(
  colleges: readonly College[],
  essays: readonly Essay[],
  exams: readonly ExamScore[],
  todayIso: string,
): ApplicationRow[] {
  const hasExam = exams.some((t) => t.overallScore !== undefined);
  const rows = colleges
    .filter((c) => c.status !== 'removed')
    .map((c) => {
      const mine = essays.filter((e) => e.collegeId === c.collegeId);
      const nd = nextDeadline(c, todayIso);
      return {
        collegeId: c.collegeId,
        name: c.name,
        status: c.status,
        programType: c.programType,
        isTopPick: c.isTopPick,
        nextDeadline: nd,
        daysUntilDeadline: nd ? daysUntil(nd.date, todayIso) : null,
        essays: {
          total: mine.length,
          final: mine.filter((e) => e.status === 'final').length,
          statuses: mine.map((e) => e.status ?? 'drafting'),
        },
        hasExamScore: hasExam,
      } satisfies ApplicationRow;
    });
  // Soonest upcoming deadline first; colleges without a deadline sort last.
  return rows.sort((a, b) => {
    const da = a.daysUntilDeadline ?? Number.POSITIVE_INFINITY;
    const db = b.daysUntilDeadline ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });
}
