// @vitest-environment jsdom
// The essay coach workspace: "Try a different question" (autosave the current draft, then return to
// the questions-first front door) and async "Evaluate" — a full "up to a minute" view while the
// essay-coach worker rates the draft, then the rubric result, then back to editing (draft intact).

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EssayWorkspace, POLL_MS } from './EssayWorkspace';
import type { Essay, EssayReview } from './types';

const { addDraft, startEssayEvaluation, getEssayEvaluationJob, updateEssay } = vi.hoisted(() => ({
  addDraft: vi.fn(),
  startEssayEvaluation: vi.fn(),
  getEssayEvaluationJob: vi.fn(),
  updateEssay: vi.fn(),
}));
vi.mock('./api', () => ({
  addDraft,
  findExperiences: vi.fn(),
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

  it('copies the essay text for pasting into a portal, then nudges to mark it final', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    updateEssay.mockResolvedValue({ ...essay, status: 'final' });
    const onChanged = vi.fn();
    render(<EssayWorkspace essay={essay} onChanged={onChanged} onBack={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /copy essay/i }));
    expect(writeText).toHaveBeenCalledWith('My draft about the ICU.');
    expect(await screen.findByText(/pasted into the portal/i)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /mark final/i }).at(-1)!);
    expect(updateEssay).toHaveBeenCalledWith('e1', { status: 'final' });
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: 'final' }));
  });

  it('the nudge is dismissible', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<EssayWorkspace essay={essay} onChanged={() => {}} onBack={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /copy essay/i }));
    await userEvent.click(await screen.findByRole('button', { name: /not yet/i }));
    expect(screen.queryByText(/pasted into the portal/i)).not.toBeInTheDocument();
  });

  it('honors the essay\'s own word target (falls back to 650 only when unset)', () => {
    render(<EssayWorkspace essay={{ ...essay, targetWords: 350 }} collegeName="Ohio State" onChanged={() => {}} onBack={() => {}} />);
    expect(screen.getByText(/\/ 350 words/)).toBeInTheDocument();
    expect(screen.getByLabelText('Word target for this essay')).toHaveValue(350);
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

  it('returns to the editor with the draft intact on "Back to editing"', async () => {
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

  it('auto-saves then returns to questions on "Try a different question"', async () => {
    addDraft.mockResolvedValue({ ...essay });
    const onTryAnother = vi.fn();
    render(<EssayWorkspace essay={essay} onChanged={vi.fn()} onBack={() => {}} onTryAnother={onTryAnother} />);
    await userEvent.click(screen.getByRole('button', { name: /try a different question/i }));
    expect(addDraft).toHaveBeenCalled();          // current text preserved as an attempt
    expect(onTryAnother).toHaveBeenCalled();
  });

  it('does NOT navigate away (and shows the error) when the autosave fails', async () => {
    addDraft.mockRejectedValue(new Error('network down'));
    const onTryAnother = vi.fn();
    render(<EssayWorkspace essay={essay} onChanged={vi.fn()} onBack={() => {}} onTryAnother={onTryAnother} />);
    await userEvent.click(screen.getByRole('button', { name: /try a different question/i }));
    expect(addDraft).toHaveBeenCalled();
    expect(onTryAnother).not.toHaveBeenCalled();  // draft not lost — stay put
    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
  });
});
