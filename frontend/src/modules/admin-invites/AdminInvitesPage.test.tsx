// @vitest-environment jsdom
// Invite-only mode: pins the admin console's shareable-link contract — a blank email mints a
// LINK-ONLY invite whose /join URL lands on the clipboard, and every pending invite can re-copy
// its link later (a lost link must never be a dead end).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  createInvite: vi.fn(),
  listInvites: vi.fn(),
  revokeInvite: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('./api', () => ({
  createInvite: h.createInvite,
  listInvites: h.listInvites,
  revokeInvite: h.revokeInvite,
}));

vi.mock('../../shared/shell', () => ({
  useAuth: () => ({ user: { username: 'grahem', role: 'admin', platformAdmin: true } }),
}));

vi.mock('../../shared/ui', () => ({
  Button: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  Field: ({ label, children }: { label: string; children: ReactNode }) => (
    <label>{label}{children}</label>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Spinner: () => <span>loading</span>,
  useToast: () => h.toast,
}));

import AdminInvitesPage from './AdminInvitesPage';

beforeEach(() => {
  vi.clearAllMocks();
  h.listInvites.mockResolvedValue([]);
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('AdminInvitesPage (invite-only mode)', () => {
  it('a blank email mints a link-only invite and copies the /join URL to the clipboard', async () => {
    h.createInvite.mockResolvedValue({ code: 'LINK2345', status: 'pending' });

    render(<AdminInvitesPage />);
    fireEvent.click(await screen.findByText('Create invite link'));

    await waitFor(() => expect(h.createInvite).toHaveBeenCalledWith({ familyName: undefined }));
    expect(h.createInvite.mock.calls[0]?.[0]).not.toHaveProperty('email');
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/join?code=LINK2345')),
    );
  });

  it('shows the freshly minted link inline with its own Copy button (clipboard may have refused)', async () => {
    h.createInvite.mockResolvedValue({ code: 'LINK2345', status: 'pending' });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) } });

    render(<AdminInvitesPage />);
    fireEvent.click(await screen.findByText('Create invite link'));

    const field = await screen.findByDisplayValue(/\/join\?code=LINK2345$/);
    expect(field).toHaveAttribute('readonly');
    expect(h.toast.error).toHaveBeenCalled(); // the auto-copy failed, but the link is right there

    // The inline Copy is a direct tap — the case iOS allows.
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    fireEvent.click(screen.getByText('Copy'));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/join?code=LINK2345')),
    );
    expect(h.toast.success).toHaveBeenCalledWith('Invite link copied.');
  });

  it('every pending invite can re-copy its link (and link-only rows say so)', async () => {
    h.listInvites.mockResolvedValue([
      { code: 'PEND9876', status: 'pending', plan: 'free', invitedBy: 'grahem', createdAt: '', updatedAt: '' },
    ]);

    render(<AdminInvitesPage />);
    expect(await screen.findByText(/shareable link/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Copy link'));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/join?code=PEND9876')),
    );
  });
});
