// @vitest-environment jsdom
// The public storefront routing: signed-out "/" gets the landing page (product story + ways in),
// deep links still go straight to sign-in, and signed-in users never see marketing.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ status: 'unauthenticated' as string }));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ status: h.status, refresh: vi.fn(), user: null }),
}));
vi.mock('./JoinPage', () => ({ JoinPage: () => <p>join page</p> }));
vi.mock('./JoinFamilyPage', () => ({ JoinFamilyPage: () => <p>join family page</p> }));
vi.mock('./SignupPage', () => ({ SignupPage: () => <p>signup page</p> }));
vi.mock('./LoginPage', () => ({ LoginPage: () => <p>login page</p> }));

import { AuthGate } from './AuthGate';

function visit(path: string) {
  window.history.replaceState(null, '', path);
}

afterEach(() => {
  visit('/');
  h.status = 'unauthenticated';
});

describe('AuthGate public routing', () => {
  it('shows the landing page to a signed-out visitor at "/"', () => {
    visit('/');
    render(<AuthGate>app</AuthGate>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/the story of the journey/i);
    // Invite-only: sign-in is the only way in from here (invitees arrive via their /join link).
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0);
  });

  it('sends a signed-out deep link straight to sign-in (path preserved)', () => {
    visit('/dashboard');
    render(<AuthGate>app</AuthGate>);
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });

  it('shows the login page at /login', () => {
    visit('/login');
    render(<AuthGate>app</AuthGate>);
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('keeps /join and /signup public', () => {
    visit('/signup');
    const { unmount } = render(<AuthGate>app</AuthGate>);
    expect(screen.getByText('signup page')).toBeInTheDocument();
    unmount();
    visit('/join/abc123');
    render(<AuthGate>app</AuthGate>);
    expect(screen.getByText('join page')).toBeInTheDocument();
  });

  it('routes /join-family to the accept-invite page (NOT shadowed by /join)', () => {
    visit('/join-family?code=abc123');
    render(<AuthGate>app</AuthGate>);
    expect(screen.getByText('join family page')).toBeInTheDocument();
    expect(screen.queryByText('join page')).not.toBeInTheDocument();
  });

  it('renders the app (never the landing page) once signed in', () => {
    h.status = 'authenticated';
    visit('/');
    render(<AuthGate>the app</AuthGate>);
    expect(screen.getByText('the app')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /create your account/i })).not.toBeInTheDocument();
  });

  it('landing page is invite-only: sign-in CTAs only, no signup links', () => {
    visit('/');
    render(<AuthGate>app</AuthGate>);
    expect(screen.queryByRole('link', { name: /create/i })).not.toBeInTheDocument();
    const signin = screen.getAllByRole('link', { name: /sign in/i });
    expect(signin.length).toBeGreaterThan(0);
    expect(signin.every((a) => a.getAttribute('href') === '/login')).toBe(true);
  });
});
