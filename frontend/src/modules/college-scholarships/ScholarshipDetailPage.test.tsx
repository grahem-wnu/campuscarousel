// @vitest-environment jsdom
// The dossier's own page. Its job is to show the whole document, offer research when there isn't one
// yet, and get you back to the college — so those are what's pinned here.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  getScholarship: vi.fn(),
  startResearch: vi.fn(),
  deleteScholarship: vi.fn(),
  trackScholarship: vi.fn(),
  getCollege: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('./api', () => ({
  getScholarship: h.getScholarship,
  startResearch: h.startResearch,
  deleteScholarship: h.deleteScholarship,
  trackScholarship: h.trackScholarship,
}));
vi.mock('../college-hub/api', () => ({ getCollege: h.getCollege }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => h.navigate,
  useParams: () => ({ id: 'c1', scholarshipId: 's1' }),
}));
vi.mock('../../shared/ui', async () => {
  const actual = await vi.importActual<typeof import('../../shared/ui')>('../../shared/ui');
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) };
});

import ScholarshipDetailPage from './ScholarshipDetailPage';
import type { CollegeScholarship } from './types';

const award = (over: Partial<CollegeScholarship> = {}): CollegeScholarship => ({
  collegeId: 'c1',
  scholarshipId: 's1',
  name: 'Morrill Scholarship',
  category: 'academic',
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of Object.values(h)) fn.mockReset();
  h.getCollege.mockResolvedValue({ name: 'Ohio State' });
});
afterEach(() => vi.useRealTimers());

async function renderPage() {
  render(<ScholarshipDetailPage />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ScholarshipDetailPage', () => {
  it('shows the whole dossier for a researched award', async () => {
    h.getScholarship.mockResolvedValue(
      award({
        researchStatus: 'complete',
        research: {
          summary: 'A full-tuition award.',
          odds: { competitiveness: 'very-high', estimate: 'About 20 of 1,200.' },
          contacts: [{ name: 'Dana Reyes', email: 'dreyes@osu.edu' }],
        },
      }),
    );

    await renderPage();

    expect(screen.getByText('Morrill Scholarship')).toBeTruthy();
    expect(screen.getByText('A full-tuition award.')).toBeTruthy();
    expect(screen.getByText('Very competitive')).toBeTruthy();
    expect(screen.getByText('dreyes@osu.edu')).toBeTruthy();
  });

  it('offers research when the award has none yet', async () => {
    h.getScholarship.mockResolvedValue(award());

    await renderPage();

    expect(screen.getByText(/hasn’t been researched yet/)).toBeTruthy();
    expect(screen.getByText('Research this scholarship')).toBeTruthy();
  });

  it('researches on demand and polls until the dossier lands', async () => {
    h.getScholarship
      .mockResolvedValueOnce(award())
      .mockResolvedValue(award({ researchStatus: 'complete', research: { summary: 'Fresh dossier.' } }));
    h.startResearch.mockResolvedValue(award({ researchStatus: 'in-progress' }));

    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByText('Research this scholarship'));
      await Promise.resolve();
    });
    expect(h.startResearch).toHaveBeenCalledWith('c1', 's1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByText('Fresh dossier.')).toBeTruthy();
  });

  it('links back to the college by name', async () => {
    h.getScholarship.mockResolvedValue(award());

    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByText(/Scholarships at Ohio State/));
    });

    expect(h.navigate).toHaveBeenCalledWith('/colleges/c1');
  });

  it('still renders when the college name cannot be loaded', async () => {
    h.getScholarship.mockResolvedValue(award());
    h.getCollege.mockRejectedValue(new Error('nope'));

    await renderPage();

    expect(screen.getByText('Morrill Scholarship')).toBeTruthy();
    expect(screen.getByText(/Back to the college/)).toBeTruthy();
  });

  it('returns to the college after removing the award', async () => {
    h.getScholarship.mockResolvedValue(award());
    h.deleteScholarship.mockResolvedValue(award());

    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByText('Remove'));
      await Promise.resolve();
    });

    expect(h.deleteScholarship).toHaveBeenCalledWith('c1', 's1');
    expect(h.navigate).toHaveBeenCalledWith('/colleges/c1');
  });

  it('shows a recoverable error when the award is gone', async () => {
    h.getScholarship.mockRejectedValue(new Error('Scholarship not found'));

    await renderPage();

    expect(screen.getByText('Scholarship not found')).toBeTruthy();
    expect(screen.getByText('Back to the college')).toBeTruthy();
  });
});
