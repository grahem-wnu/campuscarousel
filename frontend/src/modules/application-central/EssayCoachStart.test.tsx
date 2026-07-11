// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EssayCoachStart } from './EssayCoachStart';
import type { CollegeOption } from './types';

const { getPracticeQuestionsForCollege, createEssay } = vi.hoisted(() => ({
  getPracticeQuestionsForCollege: vi.fn(),
  createEssay: vi.fn(),
}));
vi.mock('./api', () => ({ getPracticeQuestionsForCollege, createEssay }));

const colleges: CollegeOption[] = [{ collegeId: 'osu', name: 'Ohio State', essayPrompts: ['Why nursing at OSU?'] }];

describe('EssayCoachStart', () => {
  it('shows a roster school → its real questions (no disclosure) → "Write about this one" creates the attempt', async () => {
    getPracticeQuestionsForCollege.mockResolvedValue({
      questions: [{ question: 'Why nursing at OSU?', why: 'w', tip: 't' }],
      source: 'curated', collegeName: 'Ohio State', usedRealPrompts: true,
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
    getPracticeQuestionsForCollege.mockResolvedValue({
      questions: [{ question: 'A general prompt', why: 'w', tip: 't' }],
      source: 'ai', collegeName: 'Imaginary U', usedRealPrompts: false,
    });
    createEssay.mockResolvedValue({ essayId: 'e2', collegeName: 'Imaginary U', prompt: 'A general prompt', createdAt: '', updatedAt: '' });
    const onWrite = vi.fn();
    render(<EssayCoachStart colleges={colleges} onWrite={onWrite} onCancel={() => {}} />);

    await userEvent.type(screen.getByLabelText(/different school/i), 'Imaginary U');
    await userEvent.click(screen.getByRole('button', { name: /see questions/i }));
    expect(await screen.findByText(/couldn.t find .*Imaginary U.*current essay questions/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /write about this one/i }));
    expect(getPracticeQuestionsForCollege).toHaveBeenCalledWith(expect.objectContaining({ collegeName: 'Imaginary U' }));
    expect(createEssay).toHaveBeenCalledWith(
      expect.objectContaining({ collegeName: 'Imaginary U', promptSource: 'practice' }),
    );
  });

  it('shows an empty-state (no "Write about this one") when a school returns zero questions', async () => {
    getPracticeQuestionsForCollege.mockResolvedValue({
      questions: [], source: 'ai', collegeName: 'Empty U', usedRealPrompts: false,
    });
    render(<EssayCoachStart colleges={colleges} onWrite={vi.fn()} onCancel={() => {}} />);

    await userEvent.type(screen.getByLabelText(/different school/i), 'Empty U');
    await userEvent.click(screen.getByRole('button', { name: /see questions/i }));
    expect(await screen.findByText(/couldn.t pull any questions for .*Empty U/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /write about this one/i })).not.toBeInTheDocument();
  });

  it('resets the writing state and surfaces the error when createEssay fails', async () => {
    getPracticeQuestionsForCollege.mockResolvedValue({
      questions: [{ question: 'Why nursing at OSU?', why: 'w', tip: 't' }],
      source: 'curated', collegeName: 'Ohio State', usedRealPrompts: true,
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
    getPracticeQuestionsForCollege.mockResolvedValue({
      questions: [{ question: 'Why nursing at OSU?', why: 'w', tip: 't' }],
      source: 'curated', collegeName: 'Ohio State', usedRealPrompts: true,
    });
    render(<EssayCoachStart colleges={colleges} initialCollegeId="osu" onWrite={vi.fn()} onCancel={() => {}} />);

    expect(await screen.findByText('Why nursing at OSU?')).toBeInTheDocument();
    expect(getPracticeQuestionsForCollege).toHaveBeenCalledWith(expect.objectContaining({ collegeId: 'osu' }));
  });
});
