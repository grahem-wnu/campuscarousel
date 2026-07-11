// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ApplicationCentralPage from './ApplicationCentralPage';

const { listEssays, listCollegeOptions } = vi.hoisted(() => ({
  listEssays: vi.fn(),
  listCollegeOptions: vi.fn(),
}));
vi.mock('./api', () => ({ listEssays, listCollegeOptions, createEssay: vi.fn(), startPracticeQuestions: vi.fn(), getPracticeQuestionJob: vi.fn() }));
// Stub the heavy sub-views so the test focuses on the Essays tab.
vi.mock('./ApplicationOverview', () => ({ ApplicationOverview: () => <div /> }));
vi.mock('./RecommendationBoard', () => ({ RecommendationBoard: () => <div /> }));
vi.mock('./TestScoreTracker', () => ({ TestScoreTracker: () => <div /> }));
vi.mock('./DecisionMatrix', () => ({ DecisionMatrix: () => <div /> }));

describe('ApplicationCentralPage — Essays tab', () => {
  it('empty state shows the coach intro + Start practicing, and opens the front door (no paste-prompt modal)', async () => {
    listEssays.mockResolvedValue([]);
    listCollegeOptions.mockResolvedValue([]);
    render(<ApplicationCentralPage />);
    await userEvent.click(await screen.findByRole('tab', { name: /essays/i }));
    await userEvent.click(await screen.findByRole('button', { name: /start practicing/i }));
    // The front door renders; the old "Paste the essay prompt" textarea must be gone.
    expect(await screen.findByText(/pick a school/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/paste the essay prompt/i)).not.toBeInTheDocument();
  });
});
