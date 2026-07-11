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
});
