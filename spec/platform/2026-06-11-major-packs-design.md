# Major packs — per-major specialization on a generic core

**Status:** building Phase 1 (2026-06-11). Follows the "core without nursing" refactor — the core is now
major-agnostic; packs layer specialization back on, nursing first.

## Problem

The core treats every student the same (generic prompts, no curated major content). But a nursing
applicant and a CS applicant need different guidance, certs, exams, and college signals. We want
major-specific smarts WITHOUT re-hardcoding any one major into the core.

## Concept

A **major pack** is an optional, self-contained bundle of major-specific knowledge, keyed by major.
A student has `intendedMajors[]`; the app resolves the matching pack(s) and folds their contributions
into the generic flows. No matching pack → today's generic behavior (fail-soft). A student with two
majors activates two packs (contributions merge).

## The pack interface (`backend/shared/packs/types.ts`)

```ts
interface MajorPack {
  key: string;                 // canonical, e.g. 'nursing'
  label: string;               // 'Nursing (BSN)'
  aliases: string[];           // lowercased match tokens: ['nursing','nurse','bsn','rn',...]
  focusBrief: string;          // injected into AI prompts → major-specific guidance
  certifications?: PackCertification[];   // curated certs to suggest
  entranceExam?: { examName: string; competitiveScore?: number; note?: string };
  interviewQuestions?: string[];
  visitQuestions?: string[];
  // (later) programDetails keys + labels, benchmark targets, recommended experience types
}
```

## Registry + resolver (`backend/shared/packs/index.ts`)

A static array `ALL_PACKS` (no build-tooling glob needed — packs are few and curated) plus:
- `packsForMajors(majors)` → matched packs (token-based alias match; `'rn'` matches a `RN` token, not
  the substring of "learning").
- `packFocusBriefs(majors)`, `packCertifications(majors)`, `packEntranceExam(majors)`, … — typed folds
  the core consumers call.

## Phase 1 (this change) — prove the architecture, restore nursing AI guidance

1. Framework: `types.ts`, `nursing.ts`, `index.ts`.
2. **AI guidance:** `backend/shared/ai/major.ts` `focusLine(majors)` appends `packFocusBriefs(majors)`,
   so every prompt that already uses `focusLine` (the AI assistant today) gives nursing-specific advice
   for a nursing student — generically, via the pack.
3. **Certifications:** the cert suggester's empty `BASELINE` is sourced from `packCertifications(majors)`;
   the handler passes the student's `intendedMajors`. Nursing students get CNA/BLS/ACLS again — from the
   pack, not the core.

## Phase 2 (next) — the wider surface

- Thread `intendedMajors` into **college discovery** + **peer-benchmark** prompts (they currently pass a
  neutral phrase) and append the pack focusBrief, so "find programs / benchmark" go major-specific.
- **College `programDetails?: Record<string,string|number>`** (additive, optional) replaces hardcoded
  nursing fields: the active pack declares which keys to hydrate (nursing → NCLEX pass rate, clinical
  partners, direct-admit) and how to label them; the college page renders them generically.
- **Exam prep:** default `examName` from `packEntranceExam` (nursing → TEAS, target 78).
- **Interview + visit prep:** seed `pack.interviewQuestions` / `pack.visitQuestions`.

## Phase 3 — more packs

Author CS, pre-med, business, education packs. Each is one file; no core changes.

## Non-goals / safety

- No data migration (everything additive/optional).
- No hardcoded major in the core — the core only knows "a student has majors; ask the registry."
- Packs are server-side knowledge, not entitlements/billing.

## Testing

- Resolver: nursing aliases match; "learning" does NOT match `rn`; unknown major → no pack.
- `focusLine(['Nursing'])` contains the nursing brief; `focusLine([])` stays generic.
- Cert suggester returns the nursing baseline for a nursing major, empty for an unknown major.
