// @vitest-environment jsdom
// Public open-signup page: pins the contract that matters — it calls the public POST /auth/signup,
// auto-signs the new parent in WITHOUT a hard navigation (tokens are memory-only, a reload would
// drop them), and degrades to a manual sign-in prompt when the auto sign-in doesn't complete.
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
    <label>
      {label}
      {children}
    </label>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  useToast: () => ({ error: h.toastError, success: vi.fn() }),
}));

import { SignupPage } from './SignupPage';

function fillAndSubmit(email = 'new@x.com', password = 'pw12345678') {
  fireEvent.change(screen.getByLabelText(/your email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/choose a password/i), { target: { value: password } });
  fireEvent.click(screen.getByText('Create account'));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/signup');
});

describe('SignupPage', () => {
  it('posts to /auth/signup, then signs in and swaps the URL without a reload', async () => {
    h.post.mockResolvedValue({ tenantId: 't1' });
    h.startSignIn.mockResolvedValue({ status: 'done' });
    render(<SignupPage />);
    fillAndSubmit();

    await waitFor(() => expect(h.refresh).toHaveBeenCalled());
    expect(h.post).toHaveBeenCalledWith('/auth/signup', {
      email: 'new@x.com',
      password: 'pw12345678',
      familyName: undefined,
    });
    expect(h.startSignIn).toHaveBeenCalledWith('new@x.com', 'pw12345678');
    expect(window.location.pathname).toBe('/'); // replaceState, not window.location.href
  });

  it('rejects a short password client-side without calling the API', () => {
    render(<SignupPage />);
    fillAndSubmit('new@x.com', 'short');
    expect(h.toastError).toHaveBeenCalled();
    expect(h.post).not.toHaveBeenCalled();
  });

  it('surfaces server errors (e.g. email already registered)', async () => {
    h.post.mockRejectedValue(new Error('An account with that email already exists.'));
    render(<SignupPage />);
    fillAndSubmit();
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith('An account with that email already exists.'),
    );
    expect(h.startSignIn).not.toHaveBeenCalled();
  });

  it('falls back to manual sign-in when the auto sign-in does not complete', async () => {
    h.post.mockResolvedValue({ tenantId: 't1' });
    h.startSignIn.mockResolvedValue({ status: 'error', message: 'transient' });
    render(<SignupPage />);
    fillAndSubmit();
    await waitFor(() => expect(screen.getByText(/your account is ready/i)).toBeTruthy());
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
