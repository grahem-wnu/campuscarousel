// @vitest-environment jsdom
// Public accept-invite page: reads ?code=, posts to the public POST /family/invites/accept, then
// auto-signs the new login in WITHOUT a hard navigation (tokens are memory-only). A recoverable error
// (e.g. login name taken) surfaces a toast and leaves the form for a retry.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  post: vi.fn(),
  startSignIn: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../api', () => ({ api: { post: h.post } }));
vi.mock('./amplify', () => ({ startSignIn: h.startSignIn }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ refresh: h.refresh }) }));
vi.mock('../ui', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Field: ({ label, children }: { label: string; children: ReactNode }) => (
    <label>{label}{children}</label>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  useToast: () => ({ error: h.toastError, success: vi.fn() }),
}));

import { JoinFamilyPage } from './JoinFamilyPage';

function fill(loginName = 'keira2030', password = 'pw12345678') {
  fireEvent.change(screen.getByLabelText(/choose a login name/i), { target: { value: loginName } });
  fireEvent.change(screen.getByLabelText(/choose a password/i), { target: { value: password } });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/join-family?code=ABCD2345');
});

describe('JoinFamilyPage', () => {
  it('prefills the code from the URL', () => {
    render(<JoinFamilyPage />);
    expect(screen.getByDisplayValue('ABCD2345')).toBeInTheDocument();
  });

  it('accepts the invite then auto-signs in without a hard navigation', async () => {
    h.post.mockResolvedValue({});
    h.startSignIn.mockResolvedValue({ status: 'done' });
    render(<JoinFamilyPage />);
    fill();
    fireEvent.click(screen.getByText(/join & sign in/i));

    await waitFor(() =>
      expect(h.post).toHaveBeenCalledWith('/family/invites/accept', {
        code: 'ABCD2345',
        loginName: 'keira2030',
        password: 'pw12345678',
        displayName: undefined,
      }),
    );
    await waitFor(() => expect(h.startSignIn).toHaveBeenCalledWith('keira2030', 'pw12345678'));
    await waitFor(() => expect(h.refresh).toHaveBeenCalled());
    expect(window.location.pathname).toBe('/');
  });

  it('surfaces a recoverable error (e.g. login name taken) for retry', async () => {
    h.post.mockRejectedValue(new Error('That login name is taken.'));
    render(<JoinFamilyPage />);
    fill();
    fireEvent.click(screen.getByText(/join & sign in/i));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('That login name is taken.'));
    // Form stays put so the invitee can pick another name (backend rolled the code back to pending).
    expect(screen.getByLabelText(/choose a login name/i)).toBeInTheDocument();
    expect(h.startSignIn).not.toHaveBeenCalled();
  });
});
