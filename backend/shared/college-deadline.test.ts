import { describe, expect, it } from 'vitest';
import { collegeDeadlineDate } from './college-deadline.js';

describe('collegeDeadlineDate', () => {
  it('projects onto the student cycle: Aug–Dec → grad year − 1', () => {
    expect(collegeDeadlineDate('2026-11-01 — Early Action', 2029)).toBe('2028-11-01');
    expect(collegeDeadlineDate('December 1, 2025 (Fall 2026 entry)', 2029)).toBe('2028-12-01'); // ignores the college's stated year
    expect(collegeDeadlineDate('November 30 (UC filing window)', 2029)).toBe('2028-11-30'); // year-less, supplied from cycle
  });

  it('projects Jan–Jul → grad year (senior spring)', () => {
    expect(collegeDeadlineDate('January 15, 2026 — regular decision', 2029)).toBe('2029-01-15');
  });

  it('without a grad year, uses the stated year, else returns ""', () => {
    expect(collegeDeadlineDate('November 1, 2026')).toBe('2026-11-01');
    expect(collegeDeadlineDate('November 30 (no year given)')).toBe('');
  });

  it('returns "" when there is no month/day (e.g. "Not offered")', () => {
    expect(collegeDeadlineDate('Not offered — no Early Action', 2029)).toBe('');
    expect(collegeDeadlineDate(undefined, 2029)).toBe('');
  });
});
