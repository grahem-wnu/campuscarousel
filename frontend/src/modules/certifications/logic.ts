// Pure, framework-free helpers for the Certifications UI. Kept out of the React components so they
// can be unit-tested in the node environment (the repo has no jsdom; the logic is what's tested).

import type { BadgeTone, IconName } from '../../shared/ui';
import type { Certification, CertStatus } from './types';

export interface StatusMeta {
  label: string;
  tone: BadgeTone;
  icon: IconName;
}

/** Status badge color-coding from the spec: planned gray / in-progress blue / active green /
 *  expiring-soon yellow / expired red / renewed green. */
export const STATUS_META: Record<CertStatus, StatusMeta> = {
  planned: { label: 'Planned', tone: 'neutral', icon: 'calendar' },
  'in-progress': { label: 'In progress', tone: 'info', icon: 'clinical' },
  active: { label: 'Active', tone: 'success', icon: 'check' },
  'expiring-soon': { label: 'Expiring soon', tone: 'warn', icon: 'warning' },
  expired: { label: 'Expired', tone: 'error', icon: 'warning' },
  renewed: { label: 'Renewed', tone: 'success', icon: 'check' },
};

export const STATUS_OPTIONS: CertStatus[] = [
  'planned',
  'in-progress',
  'active',
  'expiring-soon',
  'expired',
  'renewed',
];

/** The spec's expiration-alert horizon. */
export const EXPIRING_SOON_DAYS = 90;

/** A human countdown for an expiration, given the server-computed `daysUntilExpiration`. */
export function countdownLabel(days: number | null): string {
  if (days === null) return 'No expiration';
  if (days < 0) {
    const ago = Math.abs(days);
    return ago === 1 ? 'Expired yesterday' : `Expired ${ago} days ago`;
  }
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days < 60) return `Expires in ${days} days`;
  const months = Math.round(days / 30);
  return `Expires in ~${months} month${months === 1 ? '' : 's'}`;
}

/**
 * Order for the cards: surface what needs attention first — expired, then expiring-soon, then
 * in-progress, active, renewed, planned; ties broken by soonest expiration then name.
 */
const STATUS_RANK: Record<CertStatus, number> = {
  expired: 0,
  'expiring-soon': 1,
  'in-progress': 2,
  active: 3,
  renewed: 4,
  planned: 5,
};

export function sortForDisplay(items: readonly Certification[]): Certification[] {
  return [...items].sort((a, b) => {
    const ra = STATUS_RANK[a.effectiveStatus] ?? 9;
    const rb = STATUS_RANK[b.effectiveStatus] ?? 9;
    if (ra !== rb) return ra - rb;
    const da = a.daysUntilExpiration ?? Number.POSITIVE_INFINITY;
    const db = b.daysUntilExpiration ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });
}

/** Forward-looking expiring set (matches the backend's /expiring rule) for the alerts widget. */
export function expiringWithin(
  items: readonly Certification[],
  days: number = EXPIRING_SOON_DAYS,
): Certification[] {
  return items
    .filter((c) => c.daysUntilExpiration !== null && c.daysUntilExpiration >= 0 && c.daysUntilExpiration <= days)
    .sort((a, b) => (a.daysUntilExpiration ?? 0) - (b.daysUntilExpiration ?? 0));
}

/** Format a USD cost; empty string when unknown. */
export function costLabel(cost?: number): string {
  if (cost === undefined) return '';
  if (cost === 0) return 'Free';
  return `$${cost.toLocaleString('en-US')}`;
}
