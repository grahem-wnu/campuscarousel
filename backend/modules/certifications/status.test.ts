import { describe, expect, it } from 'vitest';
import type { Certification } from '../../shared/data/index.js';
import { daysUntil, decorate, effectiveStatus, isExpiringWithin } from './status.js';

const TODAY = '2026-06-06';

/** Minimal cert factory for the pure-logic tests. */
function cert(over: Partial<Certification> = {}): Certification {
  return {
    certId: 'c1',
    name: 'BLS/CPR',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('daysUntil', () => {
  it('counts whole days forward and backward (UTC)', () => {
    expect(daysUntil('2026-06-16', TODAY)).toBe(10);
    expect(daysUntil('2026-06-06', TODAY)).toBe(0);
    expect(daysUntil('2026-06-01', TODAY)).toBe(-5);
  });

  it('returns null on an unparseable date', () => {
    expect(daysUntil('not-a-date', TODAY)).toBeNull();
  });
});

describe('effectiveStatus', () => {
  it('keeps a non-expiration lifecycle state regardless of dates', () => {
    expect(effectiveStatus(cert({ status: 'planned', expirationDate: '2020-01-01' }), TODAY)).toBe('planned');
    expect(effectiveStatus(cert({ status: 'in-progress' }), TODAY)).toBe('in-progress');
  });

  it('derives expiring-soon for an active cert within the 90-day horizon', () => {
    expect(effectiveStatus(cert({ status: 'active', expirationDate: '2026-08-01' }), TODAY)).toBe('expiring-soon');
  });

  it('derives expired for an active cert past its expiration', () => {
    expect(effectiveStatus(cert({ status: 'active', expirationDate: '2026-06-05' }), TODAY)).toBe('expired');
  });

  it('leaves a comfortably-future active cert as active', () => {
    expect(effectiveStatus(cert({ status: 'active', expirationDate: '2026-12-31' }), TODAY)).toBe('active');
  });

  it('applies expiration overlay to a renewed cert too', () => {
    expect(effectiveStatus(cert({ status: 'renewed', expirationDate: '2026-06-20' }), TODAY)).toBe('expiring-soon');
  });

  it('keeps stored status when there is no expiration date', () => {
    expect(effectiveStatus(cert({ status: 'active' }), TODAY)).toBe('active');
  });

  it('defaults to active when earned, planned otherwise', () => {
    expect(effectiveStatus(cert({ status: undefined, dateEarned: '2026-01-10' }), TODAY)).toBe('active');
    expect(effectiveStatus(cert({ status: undefined }), TODAY)).toBe('planned');
  });
});

describe('isExpiringWithin', () => {
  it('counts a future expiration inside the window', () => {
    expect(isExpiringWithin(cert({ expirationDate: '2026-06-16' }), 90, TODAY)).toBe(true);
  });

  it('excludes already-expired certs (forward-looking only)', () => {
    expect(isExpiringWithin(cert({ expirationDate: '2026-06-05' }), 90, TODAY)).toBe(false);
  });

  it('excludes expirations beyond the window but includes them with a wider window', () => {
    expect(isExpiringWithin(cert({ expirationDate: '2027-06-06' }), 90, TODAY)).toBe(false);
    expect(isExpiringWithin(cert({ expirationDate: '2027-06-06' }), 400, TODAY)).toBe(true);
  });

  it('excludes certs without an expiration date', () => {
    expect(isExpiringWithin(cert({ expirationDate: null }), 90, TODAY)).toBe(false);
    expect(isExpiringWithin(cert({}), 90, TODAY)).toBe(false);
  });
});

describe('decorate', () => {
  it('attaches effectiveStatus and the countdown without mutating stored status', () => {
    const c = cert({ status: 'active', expirationDate: '2026-06-16' });
    const d = decorate(c, TODAY);
    expect(d.status).toBe('active'); // stored value untouched
    expect(d.effectiveStatus).toBe('expiring-soon');
    expect(d.daysUntilExpiration).toBe(10);
  });

  it('reports a null countdown for a non-expiring cert', () => {
    const d = decorate(cert({ status: 'active', expirationDate: null }), TODAY);
    expect(d.daysUntilExpiration).toBeNull();
    expect(d.effectiveStatus).toBe('active');
  });
});
