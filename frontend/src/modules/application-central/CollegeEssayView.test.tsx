// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CollegeEssayView, POLL_MS } from './CollegeEssayView';

const { listEssays, startPracticeQuestions, getPracticeQuestionJob, createEssay } = vi.hoisted(() => ({
  listEssays: vi.fn(),
  startPracticeQuestions: vi.fn(),
  getPracticeQuestionJob: vi.fn(),
  createEssay: vi.fn(),
}));
vi.mock('./api', () => ({ listEssays, startPracticeQuestions, getPracticeQuestionJob, createEssay }));
// Stub the heavy workspace so the test focuses on the view's state machine.
vi.mock('./EssayWorkspace', () => ({
  EssayWorkspace: ({ essay }: { essay: { essayId: string } }) => (
    <div data-testid="workspace">Workspace for {essay.essayId}</div>
  ),
}));

const college = { collegeId: 'osu', name: 'Ohio State' };

describe('CollegeEssayView', () => {
  it("startMode 'new' → searching copy → polled questions → Write creates the attempt with the fixed collegeId → workspace", async () => {
    vi.useFakeTimers();
    try {
      listEssays.mockResolvedValue([]);
      startPracticeQuestions.mockResolvedValue({ jobId: 'j1', status: 'pending' });
      getPracticeQuestionJob.mockResolvedValue({
        jobId: 'j1',
        status: 'complete',
        result: { questions: [{ question: 'Why nursing at OSU?', why: 'w', tip: 't' }], source: 'ai', usedRealPrompts: false },
      });
      createEssay.mockResolvedValue({ essayId: 'e1', collegeId: 'osu', prompt: 'Why nursing at OSU?', createdAt: '', updatedAt: '' });

      render(<CollegeEssayView college={college} startMode="new" onBack={() => {}} />);

      // Searching copy is shown immediately (initial sub for startMode 'new').
      expect(screen.getByText(/Looking for practice questions for Ohio State/i)).toBeInTheDocument();

      // Advance the poll wait, then flush the settle re-render.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      expect(screen.getByText('Why nursing at OSU?')).toBeInTheDocument();
      expect(getPracticeQuestionJob).toHaveBeenCalledWith('j1');

      // Write about it → createEssay with the FIXED collegeId → workspace opens. (getBy, not findBy:
      // RTL's findBy polling would deadlock against the frozen fake clock.)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /write about this one/i }));
        await Promise.resolve();
      });
      expect(createEssay).toHaveBeenCalledWith(
        expect.objectContaining({ collegeId: 'osu', prompt: 'Why nursing at OSU?', promptSource: 'practice' }),
      );
      expect(screen.getByTestId('workspace')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("startMode 'attempts' → lists existing essays + a 'Search for a new question' button", async () => {
    listEssays.mockResolvedValue([
      { essayId: 'e1', collegeId: 'osu', prompt: 'My OSU essay', createdAt: '', updatedAt: '' },
    ]);
    render(<CollegeEssayView college={college} startMode="attempts" onBack={() => {}} />);

    expect(await screen.findByText('My OSU essay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search for a new question/i })).toBeInTheDocument();
    expect(listEssays).toHaveBeenCalledWith({ collegeId: 'osu' });
  });

  it("'← back to colleges' calls onBack", async () => {
    listEssays.mockResolvedValue([]);
    const onBack = vi.fn();
    render(<CollegeEssayView college={college} startMode="attempts" onBack={onBack} />);
    await userEvent.click(await screen.findByRole('button', { name: /back to colleges/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
