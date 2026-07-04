// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { onboardingChat } = vi.hoisted(() => ({ onboardingChat: vi.fn() }));
vi.mock('./api', () => ({ onboardingChat }));

import OnboardingChat from './OnboardingChat';

beforeEach(() => onboardingChat.mockReset());

describe('OnboardingChat (dumb single-child interviewer)', () => {
  it('greets with the count question on the first child', () => {
    render(<OnboardingChat onFinish={vi.fn()} onUseForm={vi.fn()} childIndex={0} />);
    expect(screen.getByText(/how many students/i)).toBeInTheDocument();
  });

  it('uses the "next child" greeting for later children', () => {
    render(<OnboardingChat onFinish={vi.fn()} onUseForm={vi.fn()} childIndex={1} />);
    expect(screen.getByText(/set up your next child/i)).toBeInTheDocument();
  });

  it('reports studentCount and hands the reviewed profile to onFinish', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn().mockResolvedValue(undefined);
    const onStudentCount = vi.fn();
    onboardingChat.mockResolvedValue({ reply: 'Got it!', profile: { name: 'Ava' }, done: true, studentCount: 2 });

    render(
      <OnboardingChat
        onFinish={onFinish}
        onUseForm={vi.fn()}
        onStudentCount={onStudentCount}
        childIndex={0}
        finishLabel="Save & set up the next child"
      />,
    );

    await user.type(screen.getByPlaceholderText(/type your answer/i), 'Two kids, first is Ava');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onStudentCount).toHaveBeenCalledWith(2);

    // done:true → review form, pre-filled with the captured name and the loop's finish label.
    const finishBtn = await screen.findByRole('button', { name: /set up the next child/i });
    expect((screen.getByPlaceholderText(/as they spell it/i) as HTMLInputElement).value).toBe('Ava');

    await user.click(finishBtn);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ava' }));
  });

  it('review form shows the colleges the family named and submits edits as collegesOfInterest', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn().mockResolvedValue(undefined);
    onboardingChat.mockResolvedValue({
      reply: 'Got it!',
      profile: { name: 'Maya', collegesOfInterest: ['Cedarville University'] },
      done: true,
    });

    render(<OnboardingChat onFinish={onFinish} onUseForm={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/type your answer/i), "She's interested in Cedarville");
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Pre-filled from the chat; the family can correct it like any other field.
    const collegesInput = (await screen.findByPlaceholderText(/ohio state, cedarville/i)) as HTMLInputElement;
    expect(collegesInput.value).toBe('Cedarville University');

    await user.clear(collegesInput);
    await user.type(collegesInput, 'Cedarville University, Capital University');
    await user.click(screen.getByRole('button', { name: /finish/i }));
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ collegesOfInterest: ['Cedarville University', 'Capital University'] }),
    );
  });
});
