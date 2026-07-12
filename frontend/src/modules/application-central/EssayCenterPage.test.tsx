// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EssayCenterPage from './EssayCenterPage';

const { listCollegeOptions, listEssays } = vi.hoisted(() => ({
  listCollegeOptions: vi.fn(),
  listEssays: vi.fn(),
}));
vi.mock('./api', () => ({ listCollegeOptions, listEssays }));

describe('EssayCenterPage', () => {
  it('renders the "Essay Center" header and the college list — no tabs', async () => {
    listCollegeOptions.mockResolvedValue([{ collegeId: 'osu', name: 'Ohio State' }]);
    listEssays.mockResolvedValue([]);
    render(<EssayCenterPage />);

    expect(screen.getByRole('heading', { name: 'Essay Center' })).toBeInTheDocument();
    expect(await screen.findByText('Ohio State')).toBeInTheDocument();
    // No-tabs shell: the old tab strip is gone.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
