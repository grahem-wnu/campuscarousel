// Grade-level context for AI prompts. Time-phased advice ("do X this year", "start now") is only
// right if the model knows the student's CURRENT grade — which it can't infer from a graduation year
// alone without today's date. A class of 2030 is in ~8th–9th grade in 2026, not a junior/senior, so
// "this year" advice must be calibrated. These helpers derive the current grade from the grad year +
// the current date and produce a prompt line the model can anchor to.

/**
 * Current US K-12 grade for a graduating class as of `now`. Graduation is the spring of senior (12th)
 * grade. A date falls in the school year ENDING in `E`: spring (Jan–Jul) → E = this calendar year;
 * fall (Aug–Dec) → E = next calendar year. Current grade = 12 − (graduationYear − E). May return < 9
 * (middle school / earlier) or > 12 (already graduated).
 */
export function currentGrade(graduationYear: number, now: Date): number {
  const schoolYearEnd = now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return 12 - (graduationYear - schoolYearEnd);
}

const HS_GRADE_NAME: Record<number, string> = {
  9: '9th grade (freshman)',
  10: '10th grade (sophomore)',
  11: '11th grade (junior)',
  12: '12th grade (senior)',
};

/**
 * A prompt line stating the student's current grade and what "this year"/"now" means, so the model
 * sequences time-phased advice to the right stage. Returns undefined when the grad year is unknown
 * (callers then omit it and the model stays generic, as before).
 */
export function gradeContext(graduationYear: number | undefined, now: Date): string | undefined {
  if (!graduationYear || !Number.isFinite(graduationYear)) return undefined;
  const grade = currentGrade(graduationYear, now);
  const schoolYearEnd = now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const schoolYear = `${schoolYearEnd - 1}–${schoolYearEnd}`;
  const hsStartYear = graduationYear - 4; // 9th grade begins in the fall of (graduationYear − 4)

  if (grade > 12) {
    return `TIMELINE: The student has already finished high school (class of ${graduationYear}); advise accordingly.`;
  }
  if (grade >= 9) {
    const name = HS_GRADE_NAME[grade] ?? `grade ${grade}`;
    const yearsLeft = Math.max(graduationYear - schoolYearEnd + 1, 1); // school years left incl. the current one
    return (
      `TIMELINE: The student graduates high school in ${graduationYear}; in the current ${schoolYear} school year they are in ${name}, ` +
      `with about ${yearsLeft} year(s) of high school left. Calibrate every time-phased step to THIS grade: "this year" / "right now" ` +
      `means ${name}. Do NOT hand an underclassman senior-year application tasks — sequence milestones across the years they actually have left.`
    );
  }
  // Pre-high-school: middle school or earlier.
  const where = grade >= 6 ? `grade ${grade} (middle school)` : grade >= 1 ? `grade ${grade}` : 'elementary school';
  return (
    `TIMELINE: The student graduates high school in ${graduationYear} and is NOT in high school yet — in the current ${schoolYear} ` +
    `school year they are in ${where}, and will start 9th grade in fall ${hsStartYear}. So "this year" is BEFORE high school: frame ` +
    `advice for where they are now (exploration, study habits, what to line up for 9th grade starting ${hsStartYear}) — never current ` +
    `application or junior/senior tasks.`
  );
}
