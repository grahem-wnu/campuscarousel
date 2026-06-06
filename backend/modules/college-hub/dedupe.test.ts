import { describe, expect, it } from 'vitest';
import type { College } from '../../shared/data/index.js';
import { findActiveByName, normalizeCollegeName } from './dedupe.js';

let n = 0;
const college = (name: string, status?: College['status']): College => ({
  collegeId: `c${(n += 1)}`,
  name,
  status,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('normalizeCollegeName', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeCollegeName('  Ohio   State  University ')).toBe('ohio state university');
  });
});

describe('findActiveByName', () => {
  const list = [college('Ohio State University', 'target'), college('Indiana University', 'researching')];

  it('matches case- and whitespace-insensitively', () => {
    expect(findActiveByName(list, 'ohio state   university')?.name).toBe('Ohio State University');
  });

  it('returns undefined for an unknown name', () => {
    expect(findActiveByName(list, 'Purdue')).toBeUndefined();
  });

  it('ignores removed (soft-deleted) colleges so a name can be re-added', () => {
    const withRemoved = [...list, college('Purdue University', 'removed')];
    expect(findActiveByName(withRemoved, 'Purdue University')).toBeUndefined();
  });
});
