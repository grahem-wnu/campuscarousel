// @vitest-environment jsdom
// Prep-plan generation runs async on the worker now, so the tab kicks it off and POLLS the college
// until hsPrepStatus settles. This locks that: a 202 'in-progress' response → poll → plan renders,
// and an inline 'complete' response (tests/local backend) renders immediately without polling.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ generatePrep: vi.fn(), getCollege: vi.fn() }));

// Stub the rest of the module's deps so importing CollegeDetailPage doesn't pull in real I/O/routing.
vi.mock('./api', () => ({ generatePrep: h.generatePrep, getCollege: h.getCollege }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: 'c1' }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('../../shared/shell', () => ({ useActiveStudent: () => ({ activeStudent: { name: 'Kid' } }) }));
vi.mock('../peer-benchmark/BenchmarkCard', () => ({ BenchmarkCard: () => <div /> }));

import { PrepTab } from './CollegeDetailPage';
import type { College } from './types';

const college = (over: Partial<College> = {}): College =>
  ({ collegeId: 'c1', name: 'Arizona State University', createdAt: '', updatedAt: '', ...over }) as College;

const PLAN = { headline: 'Aim high', targets: [{ label: '3.5 GPA' }], courses: [{ label: 'AP Physics 1' }], activities: [{ label: 'Robotics' }] };

beforeEach(() => {
  vi.useFakeTimers();
  h.generatePrep.mockReset();
  h.getCollege.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('PrepTab async generation', () => {
  it('kicks off, polls while in-progress, and renders the plan once the worker finishes', async () => {
    h.generatePrep.mockResolvedValue({ status: 'in-progress', plan: null });
    // First poll still in-progress, second poll complete with the plan.
    h.getCollege
      .mockResolvedValueOnce(college({ hsPrepStatus: 'in-progress' }))
      .mockResolvedValueOnce(college({ hsPrepStatus: 'complete', hsPrepPlan: PLAN }));
    const onUpdate = vi.fn();

    render(<PrepTab college={college()} onUpdate={onUpdate} />);
    await act(async () => {
      screen.getByText('Generate my prep plan').click();
      await Promise.resolve();
    });
    expect(h.generatePrep).toHaveBeenCalledWith('c1');

    // Two 4s poll ticks → the second resolves complete and the plan is handed up.
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ hsPrepStatus: 'complete' }));
    expect(onUpdate.mock.calls.at(-1)?.[0].hsPrepPlan.headline).toBe('Aim high');
  });

  it('renders immediately when the backend ran generation inline (status complete)', async () => {
    h.generatePrep.mockResolvedValue({ status: 'complete', plan: PLAN });
    const onUpdate = vi.fn();
    render(<PrepTab college={college()} onUpdate={onUpdate} />);
    await act(async () => {
      screen.getByText('Generate my prep plan').click();
      await Promise.resolve();
    });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ hsPrepPlan: PLAN, hsPrepStatus: 'complete' }));
    expect(h.getCollege).not.toHaveBeenCalled(); // no polling needed
  });

  it('shows an error when the worker reports failure', async () => {
    h.generatePrep.mockResolvedValue({ status: 'failed', plan: null });
    render(<PrepTab college={college()} onUpdate={vi.fn()} />);
    await act(async () => {
      screen.getByText('Generate my prep plan').click();
      await Promise.resolve();
    });
    expect(screen.getByText(/Couldn't generate a plan/i)).toBeTruthy();
  });
});
