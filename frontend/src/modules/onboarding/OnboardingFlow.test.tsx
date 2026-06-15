// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  order: [] as string[],
  setActiveStudentId: vi.fn((id: string) => h.order.push(`setActive:${id}`)),
  reload: vi.fn(() => Promise.resolve()),
  post: vi.fn(),
  finishOnboarding: vi.fn(() => {
    h.order.push('finish');
    return Promise.resolve({});
  }),
  putSetup: vi.fn(() => Promise.resolve({})),
  navigate: vi.fn(),
}));

// Stub the chat: buttons that fire the injected callbacks; render childIndex + finishLabel for asserts.
vi.mock('./OnboardingChat', () => ({
  default: (props: {
    childIndex: number;
    finishLabel?: string;
    onStudentCount?: (n: number) => void;
    onFinish: (p: unknown) => Promise<void>;
  }) => (
    <div>
      <span data-testid="idx">{props.childIndex}</span>
      <span data-testid="label">{props.finishLabel}</span>
      <button onClick={() => props.onStudentCount?.(2)}>count</button>
      <button onClick={() => void props.onFinish({ name: `Kid${props.childIndex + 1}`, graduationYear: 2030 })}>
        finish
      </button>
    </div>
  ),
}));
vi.mock('../../shared/shell', () => ({
  useActiveStudent: () => ({ setActiveStudentId: h.setActiveStudentId, reload: h.reload }),
}));
vi.mock('../../shared/api', () => ({ api: { post: h.post } }));
vi.mock('./api', () => ({ finishOnboarding: h.finishOnboarding, putSetup: h.putSetup }));
vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate }));
vi.mock('../../shared/ui', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useToast: () => ({ error: vi.fn() }),
}));

import OnboardingFlow from './OnboardingFlow';

beforeEach(() => {
  h.order.length = 0;
  Object.values(h).forEach((v) => typeof v === 'function' && (v as { mockClear?: () => void }).mockClear?.());
  h.reload.mockImplementation(() => Promise.resolve());
  h.finishOnboarding.mockImplementation(() => {
    h.order.push('finish');
    return Promise.resolve({});
  });
  h.putSetup.mockImplementation(() => Promise.resolve({}));
});

describe('OnboardingFlow loop', () => {
  it('sets up two kids back-to-back, then completes', async () => {
    const user = userEvent.setup();
    h.post.mockResolvedValueOnce({ studentId: 's1' }).mockResolvedValueOnce({ studentId: 's2' });
    const onAllComplete = vi.fn();
    render(<OnboardingFlow onClose={vi.fn()} onAllComplete={onAllComplete} onUseForm={vi.fn()} />);

    // Family says "2 kids" → persisted, and the finish label reflects "more to come".
    await user.click(screen.getByText('count'));
    expect(h.putSetup).toHaveBeenCalledWith({ declaredStudentCount: 2 });
    await waitFor(() => expect(screen.getByTestId('label').textContent).toMatch(/next child/i));

    // Finish child 1: create → activate → finish → reload, then advance to index 1 (not complete yet).
    await user.click(screen.getByText('finish'));
    await waitFor(() => expect(screen.getByTestId('idx').textContent).toBe('1'));
    expect(h.post).toHaveBeenNthCalledWith(1, '/students', { name: 'Kid1', graduationYear: 2030 });
    expect(onAllComplete).not.toHaveBeenCalled();

    // Finish child 2: completes — setupComplete persisted, onAllComplete + navigate to dashboard.
    await user.click(screen.getByText('finish'));
    await waitFor(() => expect(onAllComplete).toHaveBeenCalled());
    expect(h.putSetup).toHaveBeenCalledWith({ setupComplete: true });
    expect(h.navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('activates the new student BEFORE seeding (correct scoping)', async () => {
    const user = userEvent.setup();
    h.post.mockResolvedValueOnce({ studentId: 's1' });
    render(<OnboardingFlow onClose={vi.fn()} onAllComplete={vi.fn()} onUseForm={vi.fn()} />);

    await user.click(screen.getByText('finish'));
    await waitFor(() => expect(h.finishOnboarding).toHaveBeenCalled());
    expect(h.order.indexOf('setActive:s1')).toBeLessThan(h.order.indexOf('finish'));
  });

  it('resumes mid-loop: starting on child 2 of 2 finishes in one pass', async () => {
    const user = userEvent.setup();
    h.post.mockResolvedValueOnce({ studentId: 's2' });
    const onAllComplete = vi.fn();
    render(<OnboardingFlow startIndex={1} initialTotal={2} onClose={vi.fn()} onAllComplete={onAllComplete} onUseForm={vi.fn()} />);

    expect(screen.getByTestId('idx').textContent).toBe('1');
    await user.click(screen.getByText('finish'));
    await waitFor(() => expect(onAllComplete).toHaveBeenCalled());
    expect(h.putSetup).toHaveBeenCalledWith({ setupComplete: true });
  });
});
