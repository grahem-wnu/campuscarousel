// @vitest-environment jsdom
// The essay coach sidebar: rated review (rubric + verdict) and college-style practice questions.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EssayWorkspace } from './EssayWorkspace';
import type { Essay } from './types';

const { reviewEssay, getPracticeQuestions } = vi.hoisted(() => ({
  reviewEssay: vi.fn(),
  getPracticeQuestions: vi.fn(),
}));
vi.mock('./api', () => ({
  addDraft: vi.fn(),
  findExperiences: vi.fn(),
  getPracticeQuestions,
  reviewEssay,
  updateEssay: vi.fn(),
}));

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
  it('honors the essay\'s own word target (falls back to 650 only when unset)', () => {
    render(<EssayWorkspace essay={{ ...essay, targetWords: 350 }} collegeName="Ohio State" onChanged={() => {}} onBack={() => {}} />);
    expect(screen.getByText(/\/ 350 words/)).toBeInTheDocument();
    expect(screen.getByLabelText('Word target for this essay')).toHaveValue(350);
  });


  it('shows the college chip and renders a rated review', async () => {
    reviewEssay.mockResolvedValue({
      review: {
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
      },
      essay: { ...essay, lastReview: { overall: 8, verdict: 'close', wordCount: 5, version: 1, reviewedAt: '2026-06-06' } },
    });
    const onChanged = vi.fn();
    render(<EssayWorkspace essay={essay} collegeName="Ohio State" onChanged={onChanged} onBack={() => {}} />);

    expect(screen.getByText('Ohio State')).toBeInTheDocument();
    expect(screen.getByText(/what Ohio State looks for/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /check & rate my essay/i }));
    expect(await screen.findByText('One more pass')).toBeInTheDocument();
    expect(screen.getByText('/10')).toBeInTheDocument();
    expect(screen.getByText('Answers the prompt')).toBeInTheDocument();
    expect(screen.getByText('College fit')).toBeInTheDocument();
    expect(screen.getByText('vivid scene')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ lastReview: expect.objectContaining({ overall: 8 }) }));
  });

  it('renders practice questions in the college style', async () => {
    getPracticeQuestions.mockResolvedValue({
      questions: [{ question: 'Why OSU nursing?', why: 'their real prompt', tip: 'outline first' }],
      source: 'ai',
      collegeName: 'Ohio State',
    });
    render(<EssayWorkspace essay={essay} collegeName="Ohio State" onChanged={() => {}} onBack={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /practice questions/i }));
    expect(await screen.findByText('Why OSU nursing?')).toBeInTheDocument();
    expect(screen.getByText(/Ohio State style/)).toBeInTheDocument();
    expect(screen.getByText(/outline first/)).toBeInTheDocument();
  });
});
