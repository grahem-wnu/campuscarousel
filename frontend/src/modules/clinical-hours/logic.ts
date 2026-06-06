// Pure, framework-free helpers for the Clinical Hours UI. Kept out of the React components so they
// can be unit-tested in the node environment (the repo has no jsdom; component rendering is not
// unit-tested, the logic is).

import type { Clinical, Visibility } from './types';

/** Only the student (Keira) may mark an entry private — mirrors the server rule for the UI. */
export function canSetPrivate(role: string | undefined): boolean {
  return role === 'student';
}

/** Pretty label for a visibility value. */
export function visibilityLabel(v: Visibility): string {
  return v === 'private' ? 'Private' : 'Family';
}

/** Newest first, breaking ties by creation time. Returns a new array. */
export function sortByDateDesc(items: readonly Clinical[]): Clinical[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/** Distinct facilities seen in the entries, alphabetical — feeds the facility dropdown. */
export function knownFacilities(items: readonly Clinical[]): string[] {
  const set = new Set<string>();
  for (const c of items) if (c.facility) set.add(c.facility);
  return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Distinct departments seen in the entries, alphabetical — feeds the department filter. */
export function knownDepartments(items: readonly Clinical[]): string[] {
  const set = new Set<string>();
  for (const c of items) if (c.department) set.add(c.department);
  return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Free-text client-side filter over facility/department/supervisor/duties/reflection. */
export function filterBySearch(items: readonly Clinical[], query: string): Clinical[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((c) => {
    const hay = [
      c.facility,
      c.department ?? '',
      c.supervisorName ?? '',
      c.reflection ?? '',
      ...(c.duties ?? []),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(needle);
  });
}

/** Format a decimal hours value compactly (4 not 4.00, but 3.5 kept). */
export function formatHours(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** Sort a `Record<key, number>` into descending rows for charts/lists. */
export function toSortedRows(byKey: Record<string, number>): { key: string; value: number }[] {
  return Object.entries(byKey)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Human label for a `YYYY-MM` month key, e.g. "2026-02" → "Feb 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const idx = Number(m) - 1;
  if (!y || !m || Number.isNaN(idx) || idx < 0 || idx > 11) return key;
  return `${MONTHS[idx]} ${y}`;
}

/**
 * Benchmark readiness against a program target (e.g. "CSULB avg 150; you have 87"). The target is
 * supplied by the caller — live program targets come from the Peer Benchmark module once available,
 * so nothing is hardcoded here. Returns null when there is no positive target to compare against.
 */
export function benchmarkProgress(
  totalHours: number,
  target: number | undefined,
): { pct: number; remaining: number } | null {
  if (!target || target <= 0) return null;
  const pct = Math.min(100, Math.round((totalHours / target) * 100));
  return { pct, remaining: Math.max(0, target - totalHours) };
}

/** Decode a base64 PDF payload into a Blob for download (browser only). */
export function pdfBlob(base64: string, contentType = 'application/pdf'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}
