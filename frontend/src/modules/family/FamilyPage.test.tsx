// @vitest-environment jsdom
// Pins the two invite flows that matter: the per-child "invite to sign in" (a student login code) and
// the co-parent/viewer members invite — both mint SHAREABLE CODES with no email field, and pending
// invites can be copied/revoked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  createInvite: vi.fn(),
  listInvites: vi.fn(),
  revokeInvite: vi.fn(),
  listMembers: vi.fn(),
  getStudentProfile: vi.fn(),
  students: [] as Array<Record<string, unknown>>,
  // Stable across renders — MembersCard's `load` useCallback depends on `toast`, so a fresh object
  // each render would re-fire its effect forever and hang the test.
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('./api', () => ({
  RELATIONSHIP_LABELS: {
    parent: 'Parent / Guardian',
    grandparent: 'Grandparent',
    'aunt-uncle': 'Aunt / Uncle',
    sibling: 'Sibling',
    'family-friend': 'Family friend',
    counselor: 'Counselor',
    mentor: 'Mentor',
    child: 'Child / Student',
    other: 'Other',
  },
  createInvite: h.createInvite,
  listInvites: h.listInvites,
  revokeInvite: h.revokeInvite,
  listMembers: h.listMembers,
  getStudentProfile: h.getStudentProfile,
  putStudentProfile: vi.fn(),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  deleteStudent: vi.fn(),
  deleteMember: vi.fn(),
  updateMember: vi.fn(),
}));

vi.mock('../onboarding/api', () => ({ resetStudent: vi.fn() }));

vi.mock('../../shared/shell', () => ({
  useActiveStudent: () => ({
    students: h.students,
    activeStudentId: (h.students[0]?.studentId as string) ?? null,
    activeStudent: h.students[0] ?? null,
    setActiveStudentId: vi.fn(),
    reload: vi.fn(),
  }),
  useAuth: () => ({ user: { role: 'admin', username: 'grahem' } }),
}));

vi.mock('../../shared/ui', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  Field: ({ label, children }: { label: string; children: ReactNode }) => (
    <label>{label}{children}</label>
  ),
  Icon: () => null,
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Modal: ({ title, children }: { title: string; children: ReactNode }) => (
    <div role="dialog" aria-label={title}>{children}</div>
  ),
  Select: (props: Record<string, unknown>) => <select {...(props as object)}>{(props as { children?: ReactNode }).children}</select>,
  Spinner: () => <span>loading</span>,
  useToast: () => h.toast,
}));

import FamilyPage from './FamilyPage';

beforeEach(() => {
  vi.clearAllMocks();
  h.students = [];
  h.listMembers.mockResolvedValue({ members: [] });
  h.listInvites.mockResolvedValue({ invites: [] });
  h.getStudentProfile.mockResolvedValue({});
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('per-child "invite to sign in"', () => {
  it('mints a student login code (no email field) and shows the shareable link', async () => {
    h.students = [{ studentId: 's1', name: 'Keira', status: 'active', createdAt: '', updatedAt: '' }];
    h.createInvite.mockResolvedValue({ code: 'ABCD2345', url: 'https://app/join-family?code=ABCD2345' });

    render(<FamilyPage />);
    // Row button shows "Invite to sign in" (child context is on the aria-label + adjacent name).
    fireEvent.click(await screen.findByText('Invite to sign in'));

    const dialog = await screen.findByRole('dialog', { name: /invite keira to sign in/i });
    // No email field anywhere in the flow.
    expect(within(dialog).queryByText(/email/i)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('Create invite link'));

    await waitFor(() => expect(h.createInvite).toHaveBeenCalledWith({ kind: 'student', studentId: 's1' }));
    expect(await within(dialog).findByDisplayValue('https://app/join-family?code=ABCD2345')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('ABCD2345')).toBeInTheDocument();
  });

  it('reopens the EXISTING pending invite (copy + revoke) instead of trying to mint a second one', async () => {
    h.students = [{ studentId: 's1', name: 'Jozi', status: 'active', createdAt: '', updatedAt: '' }];
    h.listInvites.mockResolvedValue({
      invites: [{ code: 'LOST1234', kind: 'student', studentId: 's1', status: 'pending', expiresAt: '2999-01-01T00:00:00Z', createdAt: '', updatedAt: '' }],
    });
    h.revokeInvite.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<FamilyPage />);
    // The row signals the pending invite instead of offering a doomed "create".
    fireEvent.click(await screen.findByText('Invite pending'));

    const dialog = await screen.findByRole('dialog', { name: /invite jozi to sign in/i });
    // The lost link is recoverable: the stored code + join URL are shown without minting anything.
    expect(await within(dialog).findByDisplayValue('LOST1234')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue(/join-family\?code=LOST1234/)).toBeInTheDocument();
    expect(h.createInvite).not.toHaveBeenCalled();

    // Revoking from here frees the child for a fresh invite.
    fireEvent.click(within(dialog).getByText('Revoke invite'));
    await waitFor(() => expect(h.revokeInvite).toHaveBeenCalledWith('LOST1234'));
    expect(await within(dialog).findByText('Create invite link')).toBeInTheDocument();
  });

  it('shows "Signed in as" and no invite button once the child has a login', async () => {
    h.students = [{ studentId: 's1', name: 'Keira', status: 'active', loginUserId: 'keira2030', createdAt: '', updatedAt: '' }];
    render(<FamilyPage />);
    expect(await screen.findByText(/signed in as keira2030/i)).toBeInTheDocument();
    expect(screen.queryByText('Invite to sign in')).not.toBeInTheDocument();
  });
});

describe('co-parent / viewer members invite', () => {
  it('mints a shareable code from kind + relationship (no email field)', async () => {
    h.createInvite.mockResolvedValue({ code: 'WXYZ9876', url: 'https://app/join-family?code=WXYZ9876' });
    render(<FamilyPage />);

    // The members "Invite" button (the child roster is empty here).
    fireEvent.click(await screen.findByText('Invite'));
    const dialog = await screen.findByRole('dialog', { name: /invite someone/i });
    expect(within(dialog).queryByText(/^email$/i)).not.toBeInTheDocument();

    // Choose co-parent (manager).
    fireEvent.change(within(dialog).getByLabelText(/access/i), { target: { value: 'coparent' } });
    fireEvent.click(within(dialog).getByText('Create invite link'));

    await waitFor(() =>
      expect(h.createInvite).toHaveBeenCalledWith(expect.objectContaining({ kind: 'coparent', relationship: expect.any(String) })),
    );
    expect(h.createInvite.mock.calls[0]?.[0]).not.toHaveProperty('email');
    expect(await within(dialog).findByDisplayValue('https://app/join-family?code=WXYZ9876')).toBeInTheDocument();
  });

  it('badges a student login (relationship=child) as "Student", not Manager/View-only', async () => {
    h.listMembers.mockResolvedValue({
      members: [{ userId: 'keira', relationship: 'child', accessLevel: 'viewer', studentId: 's1', status: 'active', createdAt: '', updatedAt: '' }],
    });
    render(<FamilyPage />);
    expect(await screen.findByText('Student')).toBeInTheDocument();
    expect(screen.queryByText('Manager')).not.toBeInTheDocument();
    expect(screen.queryByText('View-only')).not.toBeInTheDocument();
  });

  it('lists a pending invite with Copy and Revoke', async () => {
    h.listInvites.mockResolvedValue({
      invites: [{ code: 'PEND1234', kind: 'viewer', relationship: 'grandparent', status: 'pending', expiresAt: '', createdAt: '', updatedAt: '' }],
    });
    h.revokeInvite.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<FamilyPage />);
    expect(await screen.findByText('PEND1234')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Copy link'));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/join-family?code=PEND1234')));

    fireEvent.click(screen.getByText('Revoke'));
    await waitFor(() => expect(h.revokeInvite).toHaveBeenCalledWith('PEND1234'));
  });
});
