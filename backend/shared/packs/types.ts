// Major packs — per-major specialization layered onto the generic core (see
// spec/platform/2026-06-11-major-packs-design.md). The core stays major-agnostic; a pack supplies the
// major-specific knowledge. A student's `intendedMajors` resolve to zero or more packs whose
// contributions are folded into the generic flows. No matching pack → generic behavior (fail-soft).

/** A curated certification a pack recommends. Mapped into the certifications module's CertSuggestion. */
export interface PackCertification {
  name: string;
  issuingOrganization?: string;
  why: string;
  /** 1 = foundational/do-first. */
  priority?: number;
}

export interface MajorPack {
  /** Canonical key, e.g. 'nursing'. */
  key: string;
  /** Human label, e.g. 'Nursing (BSN)'. */
  label: string;
  /** Lowercased match tokens (single words match a major's tokens; multi-word match as substrings). */
  aliases: string[];
  /** Injected into AI prompts so guidance is major-specific. One or two sentences. */
  focusBrief: string;
  /** Curated certs to suggest for this major. */
  certifications?: PackCertification[];
  /** The standardized/entrance exam this major expects (nursing → TEAS). Majors with no standardized
   *  entrance exam (e.g. construction management) leave this unset, and the exam metric is hidden. */
  entranceExam?: { examName: string; competitiveScore?: number; note?: string };
  /** Label for the major's "hands-on experience hours" metric in benchmarks (nursing → "Clinical
   *  hours", construction → "Internship / jobsite hours"). Defaults to "Experience hours" with no pack. */
  experienceLabel?: string;
  /** Major-specific interview questions (seed the interview question bank). */
  interviewQuestions?: string[];
  /** Major-specific campus-visit questions (seed the visit prep checklist). */
  visitQuestions?: string[];
  /** A hint for AI college hydration: the major-specific facts worth gathering about a school's
   *  program, captured generically into College.programDetails as labeled pairs (e.g. nursing →
   *  NCLEX pass rate, clinical partners, direct-admit vs secondary). */
  programDetailsHint?: string;
}
