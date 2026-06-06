// Pure draft/version helpers for the essay workspace. No data-layer/AWS access, so unit-tested.

import type { Essay } from '../../shared/data/index.js';

export type Draft = NonNullable<Essay['drafts']>[number];

/** Word count: whitespace-delimited non-empty tokens. */
export function wordCount(content: string): number {
  const t = content.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Append a new draft version to an essay's draft list. Version is max(existing)+1 (1-based), with
 * wordCount + createdAt stamped. `now` is injected for deterministic tests. Returns a new array.
 */
export function appendDraft(existing: Draft[] | undefined, content: string, now: string): Draft[] {
  const drafts = existing ?? [];
  const nextVersion = drafts.reduce((max, d) => Math.max(max, d.version), 0) + 1;
  return [...drafts, { version: nextVersion, content, wordCount: wordCount(content), createdAt: now }];
}

/** The most recent draft by version, or null. */
export function latestDraft(drafts: Draft[] | undefined): Draft | null {
  if (!drafts || drafts.length === 0) return null;
  return drafts.reduce((latest, d) => (d.version > latest.version ? d : latest));
}
