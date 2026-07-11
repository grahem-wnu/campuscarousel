// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CollegeEssayList } from './CollegeEssayList';

const { listCollegeOptions, listEssays } = vi.hoisted(() => ({
  listCollegeOptions: vi.fn(),
  listEssays: vi.fn(),
}));
vi.mock('./api', () => ({ listCollegeOptions, listEssays }));

describe('CollegeEssayList', () => {
  it('a zero-essay college shows "Start essay" → onStart; a 2-essay college shows the count + "Essays →" → onOpen', async () => {
    listCollegeOptions.mockResolvedValue([
      { collegeId: 'osu', name: 'Ohio State' },
      { collegeId: 'duke', name: 'Duke University' },
    ]);
    listEssays.mockResolvedValue([
      { essayId: 'e1', collegeId: 'duke', prompt: 'p1', createdAt: '', updatedAt: '' },
      { essayId: 'e2', collegeId: 'duke', prompt: 'p2', createdAt: '', updatedAt: '' },
      // Legacy essay with no collegeId — must be ignored (no phantom college row).
      { essayId: 'e3', prompt: 'orphan', createdAt: '', updatedAt: '' },
    ]);
    const onStart = vi.fn();
    const onOpen = vi.fn();
    render(<CollegeEssayList onStart={onStart} onOpen={onOpen} />);

    // Ohio State: 0 essays → "Start essay".
    expect(await screen.findByText('Ohio State')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /start essay/i }));
    expect(onStart).toHaveBeenCalledWith({ collegeId: 'osu', name: 'Ohio State' });

    // Duke: 2 essays → "2 practice essays" + "Essays →".
    expect(screen.getByText('2 practice essays')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /essays/i }));
    expect(onOpen).toHaveBeenCalledWith({ collegeId: 'duke', name: 'Duke University' });

    // No phantom college from the orphan essay.
    expect(screen.queryByText('orphan')).not.toBeInTheDocument();
  });
});
