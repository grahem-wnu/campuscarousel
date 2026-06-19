// Major-pack registry + resolver. The core calls these folds with the student's `intendedMajors`;
// with no matching pack they return empty, so the generic core behavior is unchanged (fail-soft).

import { nursingPack } from './nursing.js';
import { computerSciencePack } from './computer-science.js';
import { preHealthPack } from './pre-health.js';
import { businessPack } from './business.js';
import { engineeringPack } from './engineering.js';
import { educationPack } from './education.js';
import { psychologyPack } from './psychology.js';
import { neurosciencePack } from './neuroscience.js';
import { constructionManagementPack } from './construction-management.js';
import { architecturePack } from './architecture.js';
import type { MajorPack, PackCertification } from './types.js';

export type { MajorPack, PackCertification } from './types.js';

/** All authored packs. Add a new major by adding one file + one entry here — no core changes. */
export const ALL_PACKS: readonly MajorPack[] = [
  nursingPack,
  computerSciencePack,
  preHealthPack,
  businessPack,
  engineeringPack,
  educationPack,
  psychologyPack,
  neurosciencePack,
  constructionManagementPack,
  architecturePack,
];

/** Tokenize a major string into lowercase word tokens (so 'rn' matches "RN", not "learning"). */
function tokensOf(major: string): Set<string> {
  return new Set(
    major
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function matches(pack: MajorPack, major: string): boolean {
  const lower = major.toLowerCase().trim();
  if (!lower) return false;
  const tokens = tokensOf(major);
  if (tokens.has(pack.key)) return true;
  return pack.aliases.some((alias) => (alias.includes(' ') || alias.includes('-') ? lower.includes(alias) : tokens.has(alias)));
}

/** The pack(s) a student's majors activate (deduped, in registry order). */
export function packsForMajors(majors?: readonly string[]): MajorPack[] {
  const wanted = (majors ?? []).map((m) => m.trim()).filter(Boolean);
  if (wanted.length === 0) return [];
  return ALL_PACKS.filter((pack) => wanted.some((m) => matches(pack, m)));
}

/** Major-specific guidance lines to append to AI prompts. */
export function packFocusBriefs(majors?: readonly string[]): string[] {
  return packsForMajors(majors).map((p) => p.focusBrief);
}

/** Curated certs the active pack(s) recommend (deduped by name). */
export function packCertifications(majors?: readonly string[]): PackCertification[] {
  const seen = new Set<string>();
  const out: PackCertification[] = [];
  for (const pack of packsForMajors(majors)) {
    for (const cert of pack.certifications ?? []) {
      const key = cert.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cert);
    }
  }
  return out;
}

/** The entrance exam the first active pack expects (e.g. nursing → TEAS), or undefined. */
export function packEntranceExam(majors?: readonly string[]): MajorPack['entranceExam'] | undefined {
  return packsForMajors(majors).find((p) => p.entranceExam)?.entranceExam;
}

/** Label for the major's "hands-on experience hours" metric (nursing → "Clinical hours"); defaults
 *  to the generic "Experience hours" when no pack supplies one. */
export function packExperienceLabel(majors?: readonly string[]): string {
  return packsForMajors(majors).find((p) => p.experienceLabel)?.experienceLabel ?? 'Experience hours';
}

/** Major-aware labels for the peer-benchmark metrics. `exam` is the entrance-exam name (omitted when
 *  the major has no standardized entrance exam, so that row is hidden); `experience` labels the
 *  hands-on-hours metric. Drives the College fit/benchmark card and the Peer Benchmark page. */
export function benchmarkMetricLabels(majors?: readonly string[]): { exam?: string; experience: string } {
  const exam = packEntranceExam(majors)?.examName;
  return { ...(exam ? { exam } : {}), experience: packExperienceLabel(majors) };
}

/** Major-specific interview questions the active pack(s) seed (deduped, in registry order). */
export function packInterviewQuestions(majors?: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pack of packsForMajors(majors)) {
    for (const q of pack.interviewQuestions ?? []) {
      const key = q.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(q);
      }
    }
  }
  return out;
}

/** Hints for AI college hydration: the major-specific facts worth gathering (→ College.programDetails). */
export function packProgramDetailsHints(majors?: readonly string[]): string[] {
  return packsForMajors(majors)
    .map((p) => p.programDetailsHint)
    .filter((h): h is string => Boolean(h));
}
