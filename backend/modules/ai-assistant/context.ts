// Pure context assembly: turn (already visibility-filtered) DB records into the compact data
// summary + the grounding records the model sees. The handler is responsible for applying
// `aiVisibleSet` to the visibility-bearing collections BEFORE calling these — so a private entry
// can only ever reach `selectRecords` when keira is the caller. Unit-tested in context.test.ts.

import type {
  Activity,
  Clinical,
  College,
  Course,
  Goal,
  Scholarship,
  Teas,
  WhyNursing,
} from '../../shared/data/index.js';
import type { DataSummary, GroundingRecord, Mode } from './chat.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const sum = (ns: readonly number[]): number => ns.reduce((a, b) => a + b, 0);

export interface SummarySources {
  courses: readonly Course[];
  teas: readonly Teas[];
  clinical: readonly Clinical[];
  activities: readonly Activity[];
  colleges: readonly College[];
  goals: readonly Goal[];
}

/** Weighted GPA (gradePoints × units / units), undefined when nothing is graded. */
function gpaOf(courses: readonly Course[]): number | undefined {
  const graded = courses.filter((c) => typeof c.gradePoints === 'number');
  if (!graded.length) return undefined;
  let pts = 0;
  let units = 0;
  for (const c of graded) {
    const u = typeof c.units === 'number' && c.units > 0 ? c.units : 1;
    pts += (c.gradePoints as number) * u;
    units += u;
  }
  return units ? round2(pts / units) : undefined;
}

export function buildSummary(s: SummarySources): DataSummary {
  const teasScores = s.teas.map((t) => t.overallScore).filter((n): n is number => typeof n === 'number');
  return {
    gpa: gpaOf(s.courses),
    bestTeas: teasScores.length ? Math.max(...teasScores) : undefined,
    clinicalHours: round2(sum(s.clinical.map((c) => (typeof c.hours === 'number' ? c.hours : 0)))),
    volunteerHours: round2(
      sum(s.activities.filter((a) => a.category === 'volunteer').map((a) => (typeof a.hours === 'number' ? a.hours : 0))),
    ),
    collegeCount: s.colleges.length,
    goalCount: s.goals.length,
  };
}

const clip = (text: string, max = 280): string => (text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`);

export interface RecordSources {
  whyNursing: readonly WhyNursing[];
  activities: readonly Activity[];
  clinical: readonly Clinical[];
  colleges: readonly College[];
  scholarships: readonly Scholarship[];
}

/** Most-recent-first by `date` (or createdAt fallback), capped. */
function recent<T extends { date?: string; createdAt: string }>(items: readonly T[], n: number): T[] {
  return [...items]
    .sort((a, b) => {
      const ad = a.date ?? a.createdAt;
      const bd = b.date ?? b.createdAt;
      return ad === bd ? 0 : ad < bd ? 1 : -1;
    })
    .slice(0, n);
}

/**
 * Select the grounding records for a mode. Inputs MUST already be visibility-filtered for the
 * caller (the handler applies `aiVisibleSet`), so private entries only appear here for keira.
 */
export function selectRecords(mode: Mode, s: RecordSources): GroundingRecord[] {
  const records: GroundingRecord[] = [];
  const why = (n: number) =>
    recent(s.whyNursing, n).map((w) => ({ kind: 'why-nursing', text: `${w.title}: ${clip(w.content)}` }));
  const acts = (n: number) =>
    recent(s.activities, n).map((a) => ({
      kind: 'activity',
      text: `${a.title}${a.description ? ` — ${clip(a.description, 160)}` : ''}`,
    }));

  switch (mode) {
    case 'essay-partner':
      records.push(...why(6), ...acts(4));
      break;
    case 'ask':
      records.push(...why(3), ...acts(4));
      break;
    case 'college-discovery':
      records.push(...recent(s.colleges, 8).map((c) => ({ kind: 'college', text: c.name })));
      break;
    case 'scholarship-discovery':
      records.push(
        ...recent(s.scholarships, 8).map((sc) => ({
          kind: 'scholarship',
          text: sc.name,
        })),
      );
      break;
  }
  return records;
}
