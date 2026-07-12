// @vitest-environment jsdom
// Active-student framing: a STUDENT login must never fetch the family roster (that would leak
// siblings) — it sees a single synthetic "self" entry — while a parent/manager fetches the roster
// as before.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  setActiveStudentId: vi.fn(),
  role: 'parent' as string,
  username: 'grahem',
}));

vi.mock('../api', () => ({
  api: { get: h.get },
  setActiveStudentId: h.setActiveStudentId,
}));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated', user: { role: h.role, username: h.username } }),
}));

import { ActiveStudentProvider, useActiveStudent } from './ActiveStudentContext';

function Probe() {
  const { students, activeStudentId } = useActiveStudent();
  return (
    <div>
      <span>count:{students.length}</span>
      <span>active:{activeStudentId ?? 'none'}</span>
      <span>names:{students.map((s) => s.name).join(',')}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.role = 'parent';
  h.username = 'grahem';
  h.get.mockResolvedValue({ students: [] });
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe('ActiveStudentProvider', () => {
  it('a student login SKIPS the /students fetch and sees only itself', async () => {
    h.role = 'student';
    h.username = 'keira2030';
    render(
      <ActiveStudentProvider>
        <Probe />
      </ActiveStudentProvider>,
    );
    expect(await screen.findByText('count:1')).toBeInTheDocument();
    expect(screen.getByText('active:self')).toBeInTheDocument();
    expect(screen.getByText('names:keira2030')).toBeInTheDocument();
    expect(h.get).not.toHaveBeenCalled();
  });

  it('a parent login fetches the roster', async () => {
    h.role = 'parent';
    h.get.mockResolvedValue({
      students: [
        { studentId: 's1', name: 'Keira', status: 'active', createdAt: '', updatedAt: '' },
        { studentId: 's2', name: 'Sam', status: 'active', createdAt: '', updatedAt: '' },
      ],
    });
    render(
      <ActiveStudentProvider>
        <Probe />
      </ActiveStudentProvider>,
    );
    await waitFor(() => expect(h.get).toHaveBeenCalledWith('/students'));
    expect(await screen.findByText('count:2')).toBeInTheDocument();
    expect(screen.getByText('names:Keira,Sam')).toBeInTheDocument();
  });
});
