// Exam registry — the single source of truth for each supported exam's scoring scale. The score form,
// the progression chart, and the section breakdown all read scales from here so a logged score is
// always shown against the right units (SAT 400–1600, ACT 1–36, TEAS as a %, AP 1–5). Section keys
// reuse the four data-layer fields (reading/math/science/englishLanguageUsage); each exam exposes only
// the sections that apply, with exam-specific labels and per-section maxes.

import type { Section } from './types';

export interface SectionDef {
  key: Section;
  label: string;
  max: number;
}

export interface ExamDef {
  /** Stored verbatim in ExamScore.examName. */
  id: string;
  /** Dropdown / caption label. */
  label: string;
  /** The composite/overall score's label + range. */
  overall: { label: string; min: number; max: number };
  /** Sections that apply to this exam (empty = no sub-scores, e.g. AP). */
  sections: SectionDef[];
  /** One-line scale explainer shown under the score inputs. */
  hint: string;
}

const sat: ExamDef = {
  id: 'SAT',
  label: 'SAT',
  overall: { label: 'Total score', min: 400, max: 1600 },
  sections: [
    { key: 'reading', label: 'Reading & Writing', max: 800 },
    { key: 'math', label: 'Math', max: 800 },
  ],
  hint: 'Total 400–1600 · each section 200–800.',
};

const act: ExamDef = {
  id: 'ACT',
  label: 'ACT',
  overall: { label: 'Composite score', min: 1, max: 36 },
  sections: [
    { key: 'englishLanguageUsage', label: 'English', max: 36 },
    { key: 'math', label: 'Math', max: 36 },
    { key: 'reading', label: 'Reading', max: 36 },
    { key: 'science', label: 'Science', max: 36 },
  ],
  hint: 'Composite and each section are scored 1–36.',
};

const teas: ExamDef = {
  id: 'TEAS',
  label: 'TEAS (nursing entrance)',
  overall: { label: 'Total score', min: 0, max: 100 },
  sections: [
    { key: 'reading', label: 'Reading', max: 100 },
    { key: 'math', label: 'Math', max: 100 },
    { key: 'science', label: 'Science', max: 100 },
    { key: 'englishLanguageUsage', label: 'English & Language', max: 100 },
  ],
  hint: 'Scored as a percentage — total and each section run 0–100%.',
};

const ap: ExamDef = {
  id: 'AP',
  label: 'AP exam',
  overall: { label: 'Score', min: 1, max: 5 },
  sections: [],
  hint: 'AP exams give a single score of 1–5 (no sub-scores).',
};

const psat: ExamDef = {
  id: 'PSAT/NMSQT',
  label: 'PSAT/NMSQT',
  overall: { label: 'Total score', min: 320, max: 1520 },
  sections: [
    { key: 'reading', label: 'Reading & Writing', max: 760 },
    { key: 'math', label: 'Math', max: 760 },
  ],
  hint: 'Total 320–1520 · each section 160–760.',
};

/** Fallback for "Other" / custom exams — a generic 0–100 percentage scale. */
export const OTHER_EXAM: ExamDef = {
  id: 'Other',
  label: 'Other exam',
  overall: { label: 'Score (%)', min: 0, max: 100 },
  sections: [
    { key: 'reading', label: 'Reading', max: 100 },
    { key: 'math', label: 'Math', max: 100 },
    { key: 'science', label: 'Science', max: 100 },
    { key: 'englishLanguageUsage', label: 'English & Language', max: 100 },
  ],
  hint: 'Enter each score as a percentage (0–100).',
};

/** Exams offered in the picker, in display order. */
export const EXAMS: ExamDef[] = [sat, act, teas, ap, psat];

/** Default selection when none is set yet. */
export const DEFAULT_EXAM: ExamDef = sat;

/** Resolve a stored examName to its scale. Unknown / custom names fall back to the generic scale. */
export function examDef(name?: string): ExamDef {
  if (!name) return OTHER_EXAM;
  return EXAMS.find((e) => e.id === name) ?? OTHER_EXAM;
}

/** Normalize a raw score to a 0–100 percentage of the given max (for proportional bars/lines). */
export function pctOfMax(score: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (score / max) * 100));
}
