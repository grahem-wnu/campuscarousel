// @vitest-environment jsdom
// Sign-in page: tells people without an account how to get one (invite-only), and honours the one-shot
// hint the sign-up page leaves behind (username prefilled + a line saying why they're here).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('./AuthContext', () => ({ useAuth: () => ({ refresh: vi.fn() }) }));
vi.mock('./amplify', () => ({ startSignIn: vi.fn(), completeNewPassword: vi.fn() }));

import { LoginPage } from './LoginPage';
import { peekLoginHint, rememberLoginHint } from './loginHint';

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/login');
});

describe('LoginPage', () => {
  it('tells people without an account to reach out to Grahem for an invite link', () => {
    render(<LoginPage />);
    expect(screen.getByText(/don.t have an account\? reach out to grahem for an invite link/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('prefills the username from the sign-up hand-off, shows the note, and uses the hint once', async () => {
    rememberLoginHint({ username: 'parent@example.com', note: 'You already have an account — sign in below.' });
    render(<LoginPage />);
    expect(screen.getByLabelText(/username/i)).toHaveValue('parent@example.com');
    expect(screen.getByRole('status')).toHaveTextContent(/already have an account/i);
    await waitFor(() => expect(peekLoginHint()).toBeNull());
  });
});
