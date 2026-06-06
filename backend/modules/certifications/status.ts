// Pure expiration + status logic for certifications. Kept framework-free and side-effect-free so it
// can be unit-tested for real without AWS or a clock. The handlers pass today's date in explicitly.
//
// The stored `status` is the user-controlled lifecycle state (planned / in-progress / active /
// renewed). The DISPLAY status layers expiration on top: an `active` (or `renewed`) cert whose
// expiration is near becomes `expiring-soon`, and one past its expiration becomes `expired`. We
// never mutate the stored record on a read — the effective status + countdown are computed and
// attached to the API response only.

import type { Certification } from '../../shared/data/index.js';

/** The spec's alert horizon: certs expiring within this many days are "expiring-soon". */
export const EXPIRING_SOON_DAYS = 90;

const MS_PER_DAY = 86_400_000;

/** Whole days from `todayIso` until `dateIso` (negative if `dateIso` is in the past). UTC-based. */
export function daysUntil(dateIso: string, todayIso: string): number | null {
  const target = Date.parse(`${dateIso}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(target) || Number.isNaN(today)) return null;
  return Math.round((target - today) / MS_PER_DAY);
}

/** Stored states whose DISPLAY value is (re)derived from the expiration date. `expiring-soon` and
 *  `expired` are included so a stale stored value (or an imported one) always reconciles to reality
 *  — a renewed-but-still-marked-`expired` cert recovers, and an `active` one ages into expiry. */
const EXPIRY_DERIVED = new Set(['active', 'renewed', 'expiring-soon', 'expired']);

/**
 * The status to DISPLAY for a cert, given today's date. `planned` / `in-progress` are left untouched
 * (a planned cert isn't "expired" just because a date passed). For the expiry-derived states the
 * display value is computed fresh from `expirationDate`: past → `expired`, within the horizon →
 * `expiring-soon`, otherwise the healthy base (`renewed` if stored renewed, else `active`).
 */
export function effectiveStatus(cert: Certification, todayIso: string): NonNullable<Certification['status']> {
  const stored = cert.status ?? (cert.dateEarned ? 'active' : 'planned');
  if (!EXPIRY_DERIVED.has(stored)) return stored;
  const base = stored === 'renewed' ? 'renewed' : 'active';
  if (!cert.expirationDate) return base;
  const remaining = daysUntil(cert.expirationDate, todayIso);
  if (remaining === null) return base;
  if (remaining < 0) return 'expired';
  if (remaining <= EXPIRING_SOON_DAYS) return 'expiring-soon';
  return base;
}

/** A certification decorated for the client: effective status + days-until-expiration countdown. */
export interface DecoratedCertification extends Certification {
  effectiveStatus: NonNullable<Certification['status']>;
  daysUntilExpiration: number | null;
}

/** Attach the computed display fields without persisting them. */
export function decorate(cert: Certification, todayIso: string): DecoratedCertification {
  return {
    ...cert,
    effectiveStatus: effectiveStatus(cert, todayIso),
    daysUntilExpiration: cert.expirationDate ? daysUntil(cert.expirationDate, todayIso) : null,
  };
}

/**
 * Whether a cert counts as "expiring within `days`": it has an expiration date that is in the
 * future (or today) and no more than `days` away. Already-expired certs are NOT counted here — the
 * expiring widget is a forward-looking heads-up; expired ones surface via their `expired` status.
 */
export function isExpiringWithin(cert: Certification, days: number, todayIso: string): boolean {
  if (!cert.expirationDate) return false;
  const remaining = daysUntil(cert.expirationDate, todayIso);
  if (remaining === null) return false;
  return remaining >= 0 && remaining <= days;
}
