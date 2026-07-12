// Turn a hydrated college application-deadline STRING into a real ISO date for the student's own
// application cycle. Deadlines are stored as human text (e.g. "2026-11-01 — Early Action" or
// "November 30 (UC filing window…)") and the college's published year is its CURRENT cycle — which is
// wrong for an underclassman. A student graduating in `graduationYear` applies during senior year
// (fall graduationYear-1 → spring graduationYear), so we keep the deadline's month/day and project the
// YEAR onto that cycle. Returns '' when no month/day can be extracted (e.g. "Not offered").

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const pad = (n: number): string => String(n).padStart(2, '0');

/** Extract {month, day} (and a year if the string states one) from a deadline string. */
function extractMonthDay(s: string): { month: number; day: number; year?: number } | null {
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const m = s.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
  if (m) {
    const month = MONTHS[m[1]!.toLowerCase()];
    if (month) return { month, day: Number(m[2]), year: m[3] ? Number(m[3]) : undefined };
  }
  return null;
}

/**
 * ISO date for a college deadline, projected onto the student's application cycle. With a
 * `graduationYear`: Aug–Dec → graduationYear-1 (senior fall), Jan–Jul → graduationYear (senior spring).
 * Without one: the year stated in the string, else '' (we don't guess).
 */
export function collegeDeadlineDate(deadline?: string, graduationYear?: number): string {
  if (!deadline) return '';
  const md = extractMonthDay(deadline);
  if (!md) return '';
  let year: number | undefined;
  if (graduationYear && graduationYear > 0) {
    year = md.month >= 8 ? graduationYear - 1 : graduationYear;
  } else {
    year = md.year;
  }
  if (!year) return '';
  return `${year}-${pad(md.month)}-${pad(md.day)}`;
}
