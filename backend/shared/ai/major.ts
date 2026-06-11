// Major-aware phrasing so AI prompts and copy aren't hardcoded to nursing/BSN. The product is open to
// families pursuing any major; a student's intended major(s) come from their per-child profile
// (`StudentProfile.intendedMajors`, which a kid may have more than one of). With none set we fall back
// to neutral language. focusLine() also folds in any matching major-pack guidance.

import { packFocusBriefs } from '../packs/index.js';

/** Clean, non-empty major strings. */
export function majorList(majors?: readonly string[]): string[] {
  return (majors ?? []).map((m) => m.trim()).filter(Boolean);
}

/**
 * A natural-language phrase for the student's academic focus:
 *   []                       → the fallback (default "their intended college program")
 *   ["Nursing"]              → "Nursing"
 *   ["Biology","Psychology"] → "Biology and Psychology"
 *   ["A","B","C"]            → "A, B, and C"
 */
export function majorPhrase(majors?: readonly string[], fallback = 'their intended college program'): string {
  const list = majorList(majors);
  if (list.length === 0) return fallback;
  if (list.length === 1) return list[0]!;
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

/** "program(s)" / "major(s)" agreement for one vs many majors. */
export function programNoun(majors?: readonly string[]): string {
  return majorList(majors).length > 1 ? 'programs' : 'program';
}

/**
 * A system-prompt line stating the student's academic focus (handles 0, 1, or many majors), with any
 * matching major-pack guidance appended so the AI gives major-specific advice (e.g. nursing → TEAS,
 * direct-admit BSN, clinical hours). No matching pack → just the generic focus line.
 */
export function focusLine(majors?: readonly string[]): string {
  const list = majorList(majors);
  let line: string;
  if (list.length === 0) {
    line = 'The student is exploring college options and has not locked in a specific major yet.';
  } else if (list.length === 1) {
    line = `The student is pursuing ${list[0]} programs.`;
  } else {
    line = `The student is weighing more than one major: ${majorPhrase(majors)}. Consider all of them.`;
  }
  const briefs = packFocusBriefs(majors);
  return briefs.length > 0 ? `${line} ${briefs.join(' ')}` : line;
}
