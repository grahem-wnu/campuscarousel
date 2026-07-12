// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const state: { activeStudentId: string | null; students: { studentId: string; status: string }[] } = {
  activeStudentId: null,
  students: [],
};
const { getSetup, getProfile } = vi.hoisted(() => ({ getSetup: vi.fn(), getProfile: vi.fn() }));

vi.mock('../../shared/shell', () => ({
  useActiveStudent: () => ({
    activeStudentId: state.activeStudentId,
    students: state.students,
    setActiveStudentId: vi.fn(),
    reload: vi.fn(),
  }),
}));
vi.mock('./api', () => ({ getSetup, getProfile, putProfile: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
// Stub the flow so we can read which mode/params the gate chose.
vi.mock('./OnboardingFlow', () => ({
  default: (p: { startIndex: number; initialTotal: number; createStudents?: boolean }) => (
    <div data-testid="flow" data-start={p.startIndex} data-total={p.initialTotal} data-create={String(p.createStudents)} />
  ),
}));

import OnboardingGate from './OnboardingGate';

beforeEach(() => {
  state.activeStudentId = null;
  state.students = [];
  getSetup.mockReset().mockResolvedValue({});
  getProfile.mockReset().mockResolvedValue({ onboardingComplete: true });
});

const flow = () => screen.queryByTestId('flow');

describe('OnboardingGate decisions', () => {
  it('opens the LOOP for a brand-new family with zero students (bootstrap)', async () => {
    state.students = [];
    state.activeStudentId = null;
    getSetup.mockResolvedValue({});
    render(<OnboardingGate />);
    await waitFor(() => expect(flow()).toBeInTheDocument());
    expect(flow()).toHaveAttribute('data-create', 'true');
    expect(flow()).toHaveAttribute('data-start', '0');
  });

  it('RESUMES the loop when fewer kids are set up than declared', async () => {
    state.students = [{ studentId: 's1', status: 'active' }];
    state.activeStudentId = 's1';
    getSetup.mockResolvedValue({ declaredStudentCount: 2 });
    render(<OnboardingGate />);
    await waitFor(() => expect(flow()).toBeInTheDocument());
    expect(flow()).toHaveAttribute('data-start', '1');
    expect(flow()).toHaveAttribute('data-total', '2');
    expect(flow()).toHaveAttribute('data-create', 'true');
  });

  it('does NOT open when setup is complete and the active student is onboarded', async () => {
    state.students = [{ studentId: 's1', status: 'active' }];
    state.activeStudentId = 's1';
    getSetup.mockResolvedValue({ declaredStudentCount: 1, setupComplete: true });
    getProfile.mockResolvedValue({ onboardingComplete: true });
    render(<OnboardingGate />);
    // Give the async effect a chance to run, then assert nothing opened.
    await waitFor(() => expect(getSetup).toHaveBeenCalled());
    await Promise.resolve();
    expect(flow()).not.toBeInTheDocument();
  });

  it('opens SINGLE (in-place) for an existing un-onboarded active student', async () => {
    state.students = [{ studentId: 's1', status: 'active' }];
    state.activeStudentId = 's1';
    getSetup.mockResolvedValue({ declaredStudentCount: 1, setupComplete: true });
    getProfile.mockResolvedValue({ onboardingComplete: false });
    render(<OnboardingGate />);
    await waitFor(() => expect(flow()).toBeInTheDocument());
    expect(flow()).toHaveAttribute('data-create', 'false');
  });
});
