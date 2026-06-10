import { describe, expect, it } from 'vitest';
import { STATUSES, statusLabel, TYPES, typeLabel } from './logic';

describe('labels', () => {
  it('humanizes types', () => {
    expect(typeLabel('hospital-volunteer')).toBe('Hospital volunteer');
    expect(typeLabel('cna-program')).toBe('CNA program');
  });
  it('humanizes statuses', () => {
    expect(statusLabel('discovered')).toBe('Discovered');
    expect(statusLabel('active')).toBe('Active');
  });
  it('exposes the full option lists', () => {
    expect(TYPES).toContain('shadowing');
    expect(STATUSES).toContain('completed');
  });
});
