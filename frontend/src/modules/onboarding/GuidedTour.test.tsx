// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const state = { students: [] as { studentId: string; status: string }[] };
vi.mock('../../shared/shell', () => ({
  useActiveStudent: () => ({ students: state.students }),
}));

import GuidedTour from './GuidedTour';

/** Anchors the tour targets — rendered alongside the tour so querySelector finds them. */
function Anchors({ which }: { which: string[] }) {
  return (
    <>
      {which.includes('switcher') && <button data-tour="switcher">switch</button>}
      {which.includes('/focus') && <a data-tour="/focus">focus</a>}
      {which.includes('/colleges') && <a data-tour="/colleges">colleges</a>}
    </>
  );
}

const fire = () => act(() => void window.dispatchEvent(new Event('start-tour')));

beforeEach(() => {
  window.localStorage.clear();
  state.students = [
    { studentId: 's1', status: 'active' },
    { studentId: 's2', status: 'active' },
  ];
});

describe('GuidedTour', () => {
  it('shows the switcher step first when the family has 2+ kids', () => {
    render(
      <>
        <Anchors which={['switcher', '/focus']} />
        <GuidedTour />
      </>,
    );
    fire();
    expect(screen.getByText(/switch between your kids/i)).toBeInTheDocument();
  });

  it('skips the switcher step for a single-child family', () => {
    state.students = [{ studentId: 's1', status: 'active' }];
    render(
      <>
        <Anchors which={['switcher', '/focus']} />
        <GuidedTour />
      </>,
    );
    fire();
    expect(screen.queryByText(/switch between your kids/i)).not.toBeInTheDocument();
    expect(screen.getByText(/their focus/i)).toBeInTheDocument();
  });

  it('skips steps whose anchor is absent', () => {
    render(
      <>
        <Anchors which={['/colleges']} /> {/* no switcher, no focus */}
        <GuidedTour />
      </>,
    );
    fire();
    expect(screen.queryByText(/switch between your kids/i)).not.toBeInTheDocument();
    expect(screen.getByText(/we seeded a starter list/i)).toBeInTheDocument();
  });

  it('does nothing when no anchors are present', () => {
    render(<GuidedTour />);
    fire();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks complete on Skip and does not re-run', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Anchors which={['switcher']} />
        <GuidedTour />
      </>,
    );
    fire();
    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(window.localStorage.getItem('campus-carousel:tourComplete')).toBe('1');
    fire();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
