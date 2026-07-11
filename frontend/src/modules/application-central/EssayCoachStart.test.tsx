// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EssayCoachStart } from './EssayCoachStart';
import { POLL_MS } from './EssayCoachStart';
import type { CollegeOption } from './types';

const { startPracticeQuestions, getPracticeQuestionJob, createEssay } = vi.hoisted(() => ({
  startPracticeQuestions: vi.fn(),
  getPracticeQuestionJob: vi.fn(),
  createEssay: vi.fn(),
}));
vi.mock('./api', () => ({ startPracticeQuestions, getPracticeQuestionJob, createEssay }));

const colleges: CollegeOption[] = [{ collegeId: 'osu', name: 'Ohio State', essayPrompts: ['Why nursing at OSU?'] }];

describe('EssayCoachStart', () => {
  it('shows a roster school → its real questions (no disclosure) → "Write about this one" creates the attempt', async () => {
    // startPracticeQuestions resolves a COMPLETE job so no polling is needed.
    startPracticeQuestions.mockResolvedValue({
      jobId: 'j1', status: 'complete',
      result: { questions: [{ question: 'Why nursing at OSU?', why: 'w', tip: 't' }], source: 'curated', collegeName: 'Ohio State', usedRealPrompts: true },
    });
    createEssay.mockResolvedValue({ essayId: 'e1', collegeId: 'osu', prompt: 'Why nursing at OSU?', createdAt: '', updatedAt: '' });
    const onWrite = vi.fn();
    render(<EssayCoachStart colleges={colleges} onWrite={onWrite} onCancel={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /Ohio State/ }));
    expect(await screen.findByText('Why nursing at OSU?')).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t find/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /write about this one/i }));
    expect(createEssay).toHaveBeenCalledWith(
      expect.objectContaining({ collegeId: 'osu', prompt: 'Why nursing at OSU?', promptSource: 'college' }),
    );
    expect(onWrite).toHaveBeenCalledWith(expect.objectContaining({ essayId: 'e1' }));
  });

  it('shows the disclosure banner and uses collegeName for a typed school with usedRealPrompts=false', async () => {
    startPracticeQuestions.mockResolvedValue({
      jobId: 'j2', status: 'complete',
      result: { questions: [{ question: 'A general prompt', why: 'w', tip: 't' }], source: 'ai', collegeName: 'Imaginary U', usedRealPrompts: false },
    });
    createEssay.mockResolvedValue({ essayId: 'e2', collegeName: 'Imaginary U', prompt: 'A general prompt', createdAt: '', updatedAt: '' });
    const onWrite = vi.fn();
    render(<EssayCoachStart colleges={colleges} onWrite={onWrite} onCancel={() => {}} />);

    await userEvent.type(screen.getByLabelText(/different school/i), 'Imaginary U');
    await userEvent.click(screen.getByRole('button', { name: /see questions/i }));
    expect(await screen.findByText(/couldn.t find .*Imaginary U.*current essay questions/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /write about this one/i }));
    expect(startPracticeQuestions).toHaveBeenCalledWith(expect.objectContaining({ collegeName: 'Imaginary U' }));
    expect(createEssay).toHaveBeenCalledWith(
      expect.objectContaining({ collegeName: 'Imaginary U', promptSource: 'practice' }),
    );
  });

  it('shows an empty-state (no "Write about this one") when a school returns zero questions', async () => {
    startPracticeQuestions.mockResolvedValue({
      jobId: 'j3', status: 'complete',
      result: { questions: [], source: 'ai', collegeName: 'Empty U', usedRealPrompts: false },
    });
    render(<EssayCoachStart colleges={colleges} onWrite={vi.fn()} onCancel={() => {}} />);

    await userEvent.type(screen.getByLabelText(/different school/i), 'Empty U');
    await userEvent.click(screen.getByRole('button', { name: /see questions/i }));
    expect(await screen.findByText(/couldn.t pull any questions for .*Empty U/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /write about this one/i })).not.toBeInTheDocument();
  });

  it('resets the writing state and surfaces the error when createEssay fails', async () => {
    startPracticeQuestions.mockResolvedValue({
      jobId: 'j4', status: 'complete',
      result: { questions: [{ question: 'Why nursing at OSU?', why: 'w', tip: 't' }], source: 'curated', collegeName: 'Ohio State', usedRealPrompts: true },
    });
    createEssay.mockRejectedValue(new Error('could not create'));
    const onWrite = vi.fn();
    render(<EssayCoachStart colleges={colleges} onWrite={onWrite} onCancel={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /Ohio State/ }));
    const writeBtn = await screen.findByRole('button', { name: /write about this one/i });
    await userEvent.click(writeBtn);
    expect(await screen.findByText(/could not create/i)).toBeInTheDocument();
    expect(onWrite).not.toHaveBeenCalled();
    // writingIdx reset → the button is interactive again (not stuck disabled/loading).
    expect(screen.getByRole('button', { name: /write about this one/i })).toBeEnabled();
  });

  it('auto-loads the pre-seeded school on mount via initialCollegeId', async () => {
    startPracticeQuestions.mockResolvedValue({
      jobId: 'j5', status: 'complete',
      result: { questions: [{ question: 'Why nursing at OSU?', why: 'w', tip: 't' }], source: 'curated', collegeName: 'Ohio State', usedRealPrompts: true },
    });
    render(<EssayCoachStart colleges={colleges} initialCollegeId="osu" onWrite={vi.fn()} onCancel={() => {}} />);

    expect(await screen.findByText('Why nursing at OSU?')).toBeInTheDocument();
    expect(startPracticeQuestions).toHaveBeenCalledWith(expect.objectContaining({ collegeId: 'osu' }));
  });

  it('polls a pending job until it completes, then renders the questions', async () => {
    vi.useFakeTimers();
    try {
      startPracticeQuestions.mockResolvedValue({ jobId: 'j1', status: 'pending' });
      getPracticeQuestionJob.mockResolvedValue({
        jobId: 'j1', status: 'complete',
        result: { questions: [{ question: 'Polled Q', why: 'w', tip: 't' }], source: 'ai', usedRealPrompts: false },
      });
      render(<EssayCoachStart colleges={colleges} onWrite={vi.fn()} onCancel={() => {}} />);

      // fireEvent is synchronous — userEvent's inter-event delays deadlock against frozen fake timers.
      // Kick off the async start+poll, then advance the POLL_MS wait and flush the resulting React
      // re-render inside act() (RTL's findBy polling would itself deadlock on the frozen clock).
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /general practice/i }));
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      expect(screen.getByText('Polled Q')).toBeInTheDocument();
      expect(getPracticeQuestionJob).toHaveBeenCalledWith('j1');
    } finally {
      vi.useRealTimers();
    }
  });
});
