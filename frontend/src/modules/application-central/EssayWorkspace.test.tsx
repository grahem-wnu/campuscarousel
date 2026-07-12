// @vitest-environment jsdom
// The essay coach workspace: a single autosaved body (debounce + blur), "Copy essay", "Try a
// different question" (autosave the current body, then return to the questions-first front door),
// and async "Evaluate" — a full "up to a minute" view while the essay-coach worker rates the draft,
// then the rubric result, then back to editing (body intact).

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EssayWorkspace, POLL_MS } from './EssayWorkspace';
import type { Essay, EssayReview } from './types';

const { startEssayEvaluation, getEssayEvaluationJob, updateEssay } = vi.hoisted(() => ({
  startEssayEvaluation: vi.fn(),
  getEssayEvaluationJob: vi.fn(),
  updateEssay: vi.fn(),
}));
vi.mock('./api', () => ({
  startEssayEvaluation,
  getEssayEvaluationJob,
  updateEssay,
}));

const review: EssayReview = {
  strengths: ['vivid scene'],
  improvements: ['tighten the middle'],
  authenticity: 'sounds like you',
  ratings: { promptFit: 8, voice: 9, structure: 7, specificity: 8, collegeFit: 6 },
  overall: 8,
  verdict: 'close',
  wordCount: 5,
  onTarget: false,
  rewrote: false,
  source: 'ai',
};

const essay: Essay = {
  essayId: 'e1',
  collegeId: 'osu',
  prompt: 'Why nursing?',
  status: 'drafting',
  drafts: [{ version: 1, content: 'My draft about the ICU.', createdAt: '2026-06-01', wordCount: 5 }],
  createdAt: '2026-06-01',
  updatedAt: '2026-06-01',
};

describe('EssayWorkspace — essay coach', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers(); // safety net: never leak fake timers into the next test
  });

  it('is stripped to editor + count + Copy + Evaluate — no Find / Mark final / Save draft / version history / target input', () => {
    render(<EssayWorkspace essay={{ ...essay, targetWords: 350 }} collegeName="Ohio State" onChanged={() => {}} onBack={() => {}} />);
    // Kept surfaces.
    expect(screen.getByPlaceholderText(/write your essay/i)).toBeInTheDocument();
    expect(screen.getByText(/\/ 350 words/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy essay/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^evaluate$/i })).toBeInTheDocument();
    // Removed surfaces.
    expect(screen.queryByRole('button', { name: /find relevant experiences/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark final/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save draft/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/version history/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/word target/i)).not.toBeInTheDocument();
  });

  it('copies the essay text for pasting into a portal (no mark-final nudge)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<EssayWorkspace essay={essay} onChanged={() => {}} onBack={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /copy essay/i }));
    expect(writeText).toHaveBeenCalledWith('My draft about the ICU.');
    expect(screen.queryByText(/pasted into the portal/i)).not.toBeInTheDocument();
  });

  it('honors the essay\'s own word target in the badge (falls back to 650 only when unset)', () => {
    render(<EssayWorkspace essay={{ ...essay, targetWords: 350 }} collegeName="Ohio State" onChanged={() => {}} onBack={() => {}} />);
    expect(screen.getByText(/\/ 350 words/)).toBeInTheDocument();
    render(<EssayWorkspace essay={{ ...essay, targetWords: undefined }} onChanged={() => {}} onBack={() => {}} />);
    expect(screen.getByText(/\/ 650 words/)).toBeInTheDocument();
  });

  it('autosaves the body on blur via a single-slot draft overwrite', async () => {
    updateEssay.mockResolvedValue({ ...essay });
    const onChanged = vi.fn();
    render(<EssayWorkspace essay={essay} onChanged={onChanged} onBack={() => {}} />);
    const editor = screen.getByPlaceholderText(/write your essay/i);
    await userEvent.clear(editor);
    await userEvent.type(editor, 'A brand new body');
    fireEvent.blur(editor);
    await waitFor(() => expect(updateEssay).toHaveBeenCalled());
    expect(updateEssay).toHaveBeenCalledWith('e1', {
      drafts: [expect.objectContaining({ version: 1, content: 'A brand new body', wordCount: 4 })],
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('does not autosave the seeded body on mount (the debounce skips the seed)', () => {
    render(<EssayWorkspace essay={essay} onChanged={() => {}} onBack={() => {}} />);
    // The dirtyRef guard means the seeded value never triggers a debounced save on mount.
    expect(updateEssay).not.toHaveBeenCalled();
  });

  it('shows the college chip and the coach copy', () => {
    render(<EssayWorkspace essay={essay} collegeName="Ohio State" onChanged={() => {}} onBack={() => {}} />);
    expect(screen.getByText('Ohio State')).toBeInTheDocument();
    expect(screen.getByText(/what Ohio State looks for/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^evaluate$/i })).toBeInTheDocument();
  });

  it('shows the "up to a minute" evaluating view while the job runs, then the rubric result', async () => {
    let resolveStart: (job: unknown) => void = () => {};
    startEssayEvaluation.mockReturnValue(new Promise((res) => { resolveStart = res; }));
    render(<EssayWorkspace essay={essay} collegeName="Ohio State" onChanged={vi.fn()} onBack={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /^evaluate$/i }));
    // The clear full-panel evaluating view — no rubric yet.
    expect(await screen.findByText(/up to a minute/i)).toBeInTheDocument();
    expect(screen.queryByText('One more pass')).not.toBeInTheDocument();

    resolveStart({ jobId: 'j1', essayId: 'e1', status: 'complete', result: review });

    // The result view: rubric bars + score + verdict + strengths + "never a rewrite".
    expect(await screen.findByText('One more pass')).toBeInTheDocument();
    expect(screen.getByText('/10')).toBeInTheDocument();
    expect(screen.getByText('Answers the prompt')).toBeInTheDocument();
    expect(screen.getByText('College fit')).toBeInTheDocument();
    expect(screen.getByText('vivid scene')).toBeInTheDocument();
    expect(screen.getByText(/never a rewrite/i)).toBeInTheDocument();
    expect(startEssayEvaluation).toHaveBeenCalledWith('e1', expect.objectContaining({ content: 'My draft about the ICU.' }));
  });

  it('returns to the editor with the body intact on "Back to editing"', async () => {
    startEssayEvaluation.mockResolvedValue({ jobId: 'j1', essayId: 'e1', status: 'complete', result: review });
    render(<EssayWorkspace essay={essay} collegeName="Ohio State" onChanged={vi.fn()} onBack={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /^evaluate$/i }));
    expect(await screen.findByText('One more pass')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /back to editing/i }));
    expect(screen.getByPlaceholderText(/write your essay/i)).toHaveValue('My draft about the ICU.');
    expect(screen.getByRole('button', { name: /^evaluate$/i })).toBeInTheDocument();
  });

  it('polls a pending job until it completes, then renders the result', async () => {
    vi.useFakeTimers();
    try {
      startEssayEvaluation.mockResolvedValue({ jobId: 'j1', essayId: 'e1', status: 'pending' });
      getEssayEvaluationJob.mockResolvedValue({ jobId: 'j1', essayId: 'e1', status: 'complete', result: review });
      render(<EssayWorkspace essay={essay} collegeName="Ohio State" onChanged={vi.fn()} onBack={() => {}} />);

      // fireEvent (not userEvent) so the click needs no timer-driven pointer delays under fake timers.
      fireEvent.click(screen.getByRole('button', { name: /^evaluate$/i }));
      await vi.advanceTimersByTimeAsync(0); // flush startEssayEvaluation → the evaluating view
      expect(screen.getByText(/up to a minute/i)).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(POLL_MS); // fire the poll delay → getEssayEvaluationJob → result
      expect(getEssayEvaluationJob).toHaveBeenCalledWith('e1', 'j1');
      expect(screen.getByText('One more pass')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows an error and returns to editing when the evaluation fails', async () => {
    startEssayEvaluation.mockResolvedValue({ jobId: 'j1', essayId: 'e1', status: 'failed', error: 'boom' });
    render(<EssayWorkspace essay={essay} onChanged={vi.fn()} onBack={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^evaluate$/i }));
    expect(await screen.findByText(/could not evaluate/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/write your essay/i)).toHaveValue('My draft about the ICU.');
  });

  it('autosaves the body then returns to questions on "Try a different question"', async () => {
    updateEssay.mockResolvedValue({ ...essay });
    const onTryAnother = vi.fn();
    render(<EssayWorkspace essay={essay} onChanged={vi.fn()} onBack={() => {}} onTryAnother={onTryAnother} />);
    await userEvent.click(screen.getByRole('button', { name: /try a different question/i }));
    expect(updateEssay).toHaveBeenCalledWith('e1', {
      drafts: [expect.objectContaining({ version: 1, content: 'My draft about the ICU.' })],
    });
    expect(onTryAnother).toHaveBeenCalled();
  });

  it('does NOT navigate away (and shows the error) when the autosave fails', async () => {
    updateEssay.mockRejectedValue(new Error('network down'));
    const onTryAnother = vi.fn();
    render(<EssayWorkspace essay={essay} onChanged={vi.fn()} onBack={() => {}} onTryAnother={onTryAnother} />);
    await userEvent.click(screen.getByRole('button', { name: /try a different question/i }));
    expect(updateEssay).toHaveBeenCalled();
    expect(onTryAnother).not.toHaveBeenCalled();  // body not lost — stay put
    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
  });
});
