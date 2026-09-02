// @vitest-environment jsdom
// The invite landing page is a SIGN-UP page that knows when you're already signed up: a live session
// gets a notice instead of the form; an email that already has a login (409) is handed to /login with
// the username filled in; a fresh account is signed in on the spot.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ApiError } from '../api/types';

const h = vi.hoisted(() => ({
  post: vi.fn(),
  startSignIn: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  goToLogin: vi.fn(),
  toastError: vi.fn(),
  auth: { status: 'unauthenticated' as string, user: null as null | { username: string } },
}));

vi.mock('../api', () => ({ api: { post: h.post } }));
vi.mock('./amplify', () => ({ startSignIn: h.startSignIn }));
vi.mock('./loginHint', () => ({ goToLoginWithHint: h.goToLogin }));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ status: h.auth.status, user: h.auth.user, refresh: h.refresh, signOut: h.signOut }),
}));
vi.mock('../ui', () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Field: ({ label, children }: { label: string; children: ReactNode }) => (
    <label>{label}{children}</label>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Spinner: () => <span>loading</span>,
  useToast: () => ({ error: h.toastError, success: vi.fn(), info: vi.fn() }),
}));

import { JoinPage } from './JoinPage';

function fill(email = 'parent@example.com', password = 'pw12345678') {
  fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/choose a password/i), { target: { value: password } });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.status = 'unauthenticated';
  h.auth.user = null;
  window.history.replaceState(null, '', '/join?code=ABCD2345');
});

describe('JoinPage (invite sign-up)', () => {
  it('is a sign-up form with the code prefilled and a way to sign in instead', () => {
    render(<JoinPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/create your account/i);
    expect(screen.getByDisplayValue('ABCD2345')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('waits for the session to resolve before showing anything', () => {
    h.auth.status = 'loading';
    render(<JoinPage />);
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByLabelText(/your email/i)).not.toBeInTheDocument();
  });

  it('tells a signed-in visitor they already have an account (app link + sign-out to redeem)', () => {
    h.auth.status = 'authenticated';
    h.auth.user = { username: 'grahem' };
    render(<JoinPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/already signed in/i);
    expect(screen.getByText('grahem')).toBeInTheDocument();
    expect(screen.queryByLabelText(/your email/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/sign out to use this invite/i));
    expect(h.signOut).toHaveBeenCalled();
  });

  it('creates the account then signs in on the spot (no hard navigation)', async () => {
    h.post.mockResolvedValue({ tenantId: 't1' });
    h.startSignIn.mockResolvedValue({ status: 'done' });
    render(<JoinPage />);
    fill();
    fireEvent.click(screen.getByText('Create account'));

    await waitFor(() =>
      expect(h.post).toHaveBeenCalledWith('/auth/redeem', {
        code: 'ABCD2345',
        email: 'parent@example.com',
        password: 'pw12345678',
        familyName: undefined,
      }),
    );
    await waitFor(() => expect(h.startSignIn).toHaveBeenCalledWith('parent@example.com', 'pw12345678'));
    await waitFor(() => expect(h.refresh).toHaveBeenCalled());
    expect(window.location.pathname).toBe('/');
    expect(h.goToLogin).not.toHaveBeenCalled();
  });

  it('sends an email that already has an account to sign in, username filled in', async () => {
    h.post.mockRejectedValue(new ApiError(409, 'conflict', 'An account with that email already exists.'));
    render(<JoinPage />);
    fill('existing@example.com');
    fireEvent.click(screen.getByText('Create account'));

    await waitFor(() =>
      expect(h.goToLogin).toHaveBeenCalledWith({
        username: 'existing@example.com',
        note: expect.stringMatching(/already have an account/i),
      }),
    );
    expect(h.startSignIn).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('keeps the form on any other error (bad code, expired invite)', async () => {
    h.post.mockRejectedValue(new ApiError(422, 'validation', 'This invite has expired.'));
    render(<JoinPage />);
    fill();
    fireEvent.click(screen.getByText('Create account'));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('This invite has expired.'));
    expect(screen.getByLabelText(/your email/i)).toBeInTheDocument();
    expect(h.goToLogin).not.toHaveBeenCalled();
    expect(h.startSignIn).not.toHaveBeenCalled();
  });

  it('falls back to a prefilled sign-in when the account exists but auto sign-in did not complete', async () => {
    h.post.mockResolvedValue({ tenantId: 't1' });
    h.startSignIn.mockResolvedValue({ status: 'error', message: 'Unsupported sign-in step: MFA' });
    render(<JoinPage />);
    fill();
    fireEvent.click(screen.getByText('Create account'));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/your account is ready/i);
    fireEvent.click(screen.getByText('Go to sign in'));
    expect(h.goToLogin).toHaveBeenCalledWith({
      username: 'parent@example.com',
      note: expect.stringMatching(/account is ready/i),
    });
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
