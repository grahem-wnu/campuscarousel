// @vitest-environment jsdom
// /signup is retired (invite-only mode): the route must still render — old links and bookmarks land
// here — but it explains the invite-only policy and offers sign-in instead of a dead signup form.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('../ui', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { SignupPage } from './SignupPage';

describe('SignupPage (retired — invite-only)', () => {
  it('explains invite-only and links to sign-in; no signup form remains', () => {
    render(<SignupPage />);
    expect(screen.getByText(/invite-only/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
    // No form fields — there is nothing here for a bot (or a person) to submit.
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Create account')).not.toBeInTheDocument();
  });
});
