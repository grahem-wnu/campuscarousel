import { describe, expect, it } from 'vitest';
import { STATUSES, statusLabel, TYPES, typeLabel } from './logic';

describe('labels', () => {
  it('humanizes types', () => {
    expect(typeLabel('volunteer')).toBe('Volunteering');
    expect(typeLabel('internship')).toBe('Internship');
    expect(typeLabel('training-program')).toBe('Training / certification');
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
