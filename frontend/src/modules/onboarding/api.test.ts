import { describe, expect, it, vi, beforeEach } from 'vitest';

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('../../shared/api', () => ({ api: { get, put, post: vi.fn() } }));

import { getSetup, putSetup } from './api';

describe('setup client', () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
  });

  it('getSetup GETs /setup', async () => {
    get.mockResolvedValue({ declaredStudentCount: 2 });
    await expect(getSetup()).resolves.toEqual({ declaredStudentCount: 2 });
    expect(get).toHaveBeenCalledWith('/setup');
  });

  it('putSetup PUTs /setup with the patch', async () => {
    put.mockResolvedValue({ setupComplete: true });
    await putSetup({ setupComplete: true });
    expect(put).toHaveBeenCalledWith('/setup', { setupComplete: true });
  });
});
