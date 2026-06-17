// @vitest-environment jsdom
// Regression for the async-seed timing gap: onboarding finish enqueues seeding and returns
// immediately, so the colleges don't exist when the banner first refetches. The banner must keep
// polling through that gap and reveal the seeded colleges on its own — without a navigation/remount.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  listColleges: vi.fn(),
}));

// The banner only touches listColleges + the 'onboarding-finished' event; stub the rest of the
// module's deps so importing DashboardPage doesn't pull in real I/O or routing.
vi.mock('../college-hub/api', () => ({ listColleges: h.listColleges }));
vi.mock('./api', () => ({ getDashboard: vi.fn() }));
vi.mock('../focus/api', () => ({ getFocus: vi.fn(() => Promise.resolve(null)) }));
vi.mock('../onboarding/api', () => ({ getProfile: vi.fn(() => Promise.resolve(null)) }));
vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('../../shared/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Icon: ({ name }: { name: string }) => <i data-icon={name} />,
  Spinner: () => <i data-testid="spinner" />,
  cn: (...c: unknown[]) => c.filter(Boolean).join(' '),
}));

import { SetupProgressBanner } from './DashboardPage';

const inProgress = [{ name: 'A', hydrationStatus: 'in-progress' }, { name: 'B', hydrationStatus: 'in-progress' }];

beforeEach(() => {
  vi.useFakeTimers();
  h.listColleges.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('SetupProgressBanner — async seed gap', () => {
  it('keeps polling after onboarding finish and reveals seeded colleges without a remount', async () => {
    // First refetch (the moment onboarding finishes) returns no colleges — the seed job hasn't run yet.
    h.listColleges.mockResolvedValue([]);
    render(<SetupProgressBanner />);
    await act(async () => { await Promise.resolve(); }); // flush the on-mount refresh

    // Onboarding finishes → seeding is pending; show the "setting up" state, not a misleading "all set".
    h.listColleges.mockResolvedValue([]);
    await act(async () => {
      window.dispatchEvent(new Event('onboarding-finished'));
    });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/setting up your plan/i)).toBeTruthy();

    // The seed job lands: next poll returns the freshly-seeded, still-hydrating colleges.
    h.listColleges.mockResolvedValue(inProgress);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });

    // Banner discovered them on its own — no navigation/remount needed.
    expect(screen.getByText(/researching your colleges/i)).toBeTruthy();
    expect(screen.getByText(/0 of 2 ready/i)).toBeTruthy();
  });

  it('stops at "all set" once every seeded college finishes hydrating', async () => {
    h.listColleges.mockResolvedValue([]);
    render(<SetupProgressBanner />);
    await act(async () => { await Promise.resolve(); });

    h.listColleges.mockResolvedValue(inProgress);
    await act(async () => {
      window.dispatchEvent(new Event('onboarding-finished'));
    });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/researching your colleges/i)).toBeTruthy();

    // All colleges done → banner flips to the "all set" summary.
    h.listColleges.mockResolvedValue([{ name: 'A', hydrationStatus: 'complete' }, { name: 'B', hydrationStatus: 'complete' }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(screen.getByText(/2 colleges researched/i)).toBeTruthy();
  });
});
