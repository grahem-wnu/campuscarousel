import { describe, expect, it } from 'vitest';
import { countdownLabel, costLabel, expiringWithin, sortForDisplay } from './logic';
import type { Certification } from './types';

function cert(over: Partial<Certification> = {}): Certification {
  return {
    certId: Math.random().toString(36).slice(2),
    name: 'Cert',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    effectiveStatus: 'active',
    daysUntilExpiration: null,
    ...over,
  };
}

describe('countdownLabel', () => {
  it('handles no-expiration, today, tomorrow, days, and past', () => {
    expect(countdownLabel(null)).toBe('No expiration');
    expect(countdownLabel(0)).toBe('Expires today');
    expect(countdownLabel(1)).toBe('Expires tomorrow');
    expect(countdownLabel(10)).toBe('Expires in 10 days');
    expect(countdownLabel(-1)).toBe('Expired yesterday');
    expect(countdownLabel(-5)).toBe('Expired 5 days ago');
  });

  it('switches to months past ~60 days', () => {
    expect(countdownLabel(90)).toMatch(/~3 months/);
  });
});

describe('costLabel', () => {
  it('formats free, unknown, and dollar amounts', () => {
    expect(costLabel(0)).toBe('Free');
    expect(costLabel(undefined)).toBe('');
    expect(costLabel(1200)).toBe('$1,200');
  });
});

describe('expiringWithin', () => {
  it('keeps only forward-looking expirations inside the window, soonest first', () => {
    const items = [
      cert({ name: 'Far', daysUntilExpiration: 200 }),
      cert({ name: 'Soon', daysUntilExpiration: 10 }),
      cert({ name: 'Expired', daysUntilExpiration: -3 }),
      cert({ name: 'None', daysUntilExpiration: null }),
      cert({ name: 'Mid', daysUntilExpiration: 80 }),
    ];
    expect(expiringWithin(items, 90).map((c) => c.name)).toEqual(['Soon', 'Mid']);
  });
});

describe('sortForDisplay', () => {
  it('surfaces expired and expiring-soon before healthy certs', () => {
    const items = [
      cert({ name: 'Active', effectiveStatus: 'active', daysUntilExpiration: 300 }),
      cert({ name: 'Expired', effectiveStatus: 'expired', daysUntilExpiration: -2 }),
      cert({ name: 'Planned', effectiveStatus: 'planned' }),
      cert({ name: 'Expiring', effectiveStatus: 'expiring-soon', daysUntilExpiration: 20 }),
    ];
    expect(sortForDisplay(items).map((c) => c.name)).toEqual([
      'Expired',
      'Expiring',
      'Active',
      'Planned',
    ]);
  });
});
