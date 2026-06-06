// Pure, framework-free helpers for the College Hub UI. Kept out of the React components so they can
// be unit-tested in the node environment (no jsdom; the logic is what's tested).

import type { BadgeTone } from '../../shared/ui';
import type { College, CollegeStatus, HydrationStatus, ProgramType } from './types';

export interface StatusMeta {
  label: string;
  tone: BadgeTone;
}

/** Status badge meta — the application pipeline, color-coded. */
export const STATUS_META: Record<CollegeStatus, StatusMeta> = {
  researching: { label: 'Researching', tone: 'neutral' },
  considering: { label: 'Considering', tone: 'neutral' },
  target: { label: 'Target', tone: 'primary' },
  applying: { label: 'Applying', tone: 'info' },
  applied: { label: 'Applied', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
  enrolled: { label: 'Enrolled', tone: 'success' },
  removed: { label: 'Removed', tone: 'neutral' },
};

export const PROGRAM_TYPE_LABEL: Record<ProgramType, string> = {
  'direct-admit-BSN': 'Direct-admit BSN',
  'pre-nursing-secondary-app': 'Pre-nursing (secondary app)',
  'ABSN-only': 'Accelerated BSN',
  'RN-to-BSN-only': 'RN-to-BSN',
};

/** Statuses a user may set in the UI (removed is reached via delete/restore, not the picker). */
export const SELECTABLE_STATUSES: CollegeStatus[] = [
  'researching',
  'considering',
  'target',
  'applying',
  'applied',
  'accepted',
  'rejected',
  'enrolled',
];

export interface HydrationMeta {
  label: string;
  tone: BadgeTone;
  /** Whether the UI should keep polling (a refresh is in flight). */
  busy: boolean;
}

export function hydrationMeta(status: HydrationStatus | undefined): HydrationMeta | null {
  switch (status) {
    case 'in-progress':
      return { label: 'Refreshing…', tone: 'info', busy: true };
    case 'pending':
      return { label: 'Queued', tone: 'neutral', busy: true };
    case 'partial':
      return { label: 'Partial data', tone: 'warn', busy: false };
    case 'failed':
      return { label: 'Refresh failed', tone: 'error', busy: false };
    case 'complete':
    default:
      return null; // healthy / fully hydrated → no badge
  }
}

/** True if any college on the page is mid-refresh (drives the list's poll loop). */
export function anyHydrating(colleges: readonly College[]): boolean {
  return colleges.some((c) => c.hydrationStatus === 'in-progress' || c.hydrationStatus === 'pending');
}

/** Format a USD cost; empty string when unknown. */
export function costLabel(cost?: number): string {
  if (cost === undefined) return '';
  if (cost === 0) return 'Free';
  return `$${cost.toLocaleString('en-US')}`;
}

/** The best available annual cost figure for display/comparison. */
export function bestCost(c: College): number | undefined {
  return c.estimatedCostAfterAid ?? c.estimatedTotalCost ?? c.tuitionOutOfState ?? c.tuitionInState;
}

/** Bare domain from a URL ("https://www.osu.edu/x" → "osu.edu"), or undefined. */
export function domainOf(website?: string): string | undefined {
  if (!website) return undefined;
  const m = website
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0];
  return m && m.includes('.') ? m : undefined;
}

/**
 * Logo source chain: explicit branding URL, else a Clearbit hotlink derived from the website domain.
 * Returns null when neither is available (the component then renders the graduation-cap fallback).
 * The component also swaps to the cap on an <img> load error.
 */
export function logoSrc(c: College): string | null {
  if (c.branding?.logoUrl) return c.branding.logoUrl;
  const domain = domainOf(c.website);
  return domain ? `https://logo.clearbit.com/${domain}` : null;
}

/** A short fit-score band for quick scanning. */
export function fitBand(score: number | undefined): { label: string; tone: BadgeTone } | null {
  if (score === undefined) return null;
  if (score >= 80) return { label: `Strong fit · ${score}`, tone: 'success' };
  if (score >= 60) return { label: `Good fit · ${score}`, tone: 'primary' };
  if (score >= 40) return { label: `Possible · ${score}`, tone: 'warn' };
  return { label: `Reach · ${score}`, tone: 'error' };
}

/** Normalize a college name for duplicate detection (mirrors the server's dedupe rule). */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Discovery candidates not already in the tracked list (by normalized name). */
export function untrackedCandidates<T extends { name: string }>(
  candidates: readonly T[],
  trackedNames: readonly string[],
): T[] {
  const tracked = new Set(trackedNames.map(normalizeName));
  return candidates.filter((c) => !tracked.has(normalizeName(c.name)));
}

/** Checklist completion percentage (0–100), or null when there are no items. */
export function checklistPct(items: { completed: boolean }[]): number | null {
  if (items.length === 0) return null;
  const done = items.filter((i) => i.completed).length;
  return Math.round((done / items.length) * 100);
}
