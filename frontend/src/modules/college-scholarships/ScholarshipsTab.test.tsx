// @vitest-environment jsdom
// The tab's state machine is the thing worth locking: it auto-searches a college that has never been
// searched, polls a slow search to completion, and turns a picked award into a polled dossier. Each
// of those is an async round-trip a refactor could silently break.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  listScholarships: vi.fn(),
  startSearch: vi.fn(),
  startResearch: vi.fn(),
  getScholarship: vi.fn(),
  deleteScholarship: vi.fn(),
  trackScholarship: vi.fn(),
}));

vi.mock('./api', () => h);
vi.mock('../../shared/ui', async () => {
  const actual = await vi.importActual<typeof import('../../shared/ui')>('../../shared/ui');
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) };
});

import { ScholarshipsTab } from './ScholarshipsTab';
import type { CollegeScholarship, ScholarshipsResponse } from './types';

const award = (over: Partial<CollegeScholarship> = {}): CollegeScholarship => ({
  collegeId: 'c1',
  scholarshipId: 's1',
  name: 'Morrill Scholarship',
  category: 'academic',
  ...over,
});

const response = (over: Partial<ScholarshipsResponse> = {}): ScholarshipsResponse => ({
  search: null,
  scholarships: [],
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of Object.values(h)) fn.mockReset();
});
afterEach(() => vi.useRealTimers());

/** Render and let the mount effect's promises resolve. */
async function renderTab() {
  render(<ScholarshipsTab collegeId="c1" collegeName="Ohio State" />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Advance past one poll interval and drain the resulting promises. */
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
}

describe('ScholarshipsTab', () => {
  it('auto-searches a college that has never been searched', async () => {
    h.listScholarships.mockResolvedValue(response());
    h.startSearch.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 1, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [award()] }),
    );

    await renderTab();

    expect(h.startSearch).toHaveBeenCalledWith('c1', { category: 'all' });
    expect(screen.getByText('Morrill Scholarship')).toBeTruthy();
  });

  it('does not auto-search a college that already has results', async () => {
    h.listScholarships.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 1, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [award()] }),
    );

    await renderTab();

    expect(h.startSearch).not.toHaveBeenCalled();
    expect(screen.getByText(/Last searched/)).toBeTruthy();
  });

  it('polls a slow search until the worker finishes, then lists what it found', async () => {
    h.listScholarships
      .mockResolvedValueOnce(response()) // initial read: never searched
      .mockResolvedValueOnce(response({ search: { collegeId: 'c1', status: 'in-progress' } }))
      .mockResolvedValueOnce(
        response({ search: { collegeId: 'c1', status: 'complete', found: 1, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [award()] }),
      );
    h.startSearch.mockResolvedValue(response({ search: { collegeId: 'c1', status: 'in-progress' } }));

    await renderTab();
    expect(screen.getByText(/Searching the web/)).toBeTruthy();

    await tick();
    await tick();

    expect(screen.getByText('Morrill Scholarship')).toBeTruthy();
  });

  it('surfaces a failed search with a retry rather than an empty page', async () => {
    h.listScholarships.mockResolvedValue(response());
    h.startSearch.mockResolvedValue(response({ search: { collegeId: 'c1', status: 'failed', error: 'boom' } }));

    await renderTab();

    expect(screen.getByText(/didn’t finish/)).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
  });

  it('researches the picked award, polling until the dossier lands', async () => {
    h.listScholarships.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 1, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [award()] }),
    );
    h.startResearch.mockResolvedValue(award({ researchStatus: 'in-progress' }));
    h.getScholarship.mockResolvedValue(
      award({
        researchStatus: 'complete',
        research: { summary: 'A full-tuition award.', odds: { competitiveness: 'very-high', estimate: 'About 20 of 1,200.' } },
      }),
    );

    await renderTab();

    // Pick it from the dropdown.
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 's1' } });
    });

    await act(async () => {
      screen.getByText('Research this scholarship').click();
      await Promise.resolve();
    });
    expect(h.startResearch).toHaveBeenCalledWith('c1', 's1');
    expect(screen.getByText(/Researching/)).toBeTruthy();

    await tick();

    expect(screen.getByText('A full-tuition award.')).toBeTruthy();
    expect(screen.getByText('Very competitive')).toBeTruthy();
    expect(screen.getByText('About 20 of 1,200.')).toBeTruthy();
  });

  it('shows an error when research comes back failed', async () => {
    h.listScholarships.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 1, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [award()] }),
    );
    h.startResearch.mockResolvedValue(award({ researchStatus: 'failed' }));

    await renderTab();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 's1' } });
    });
    await act(async () => {
      screen.getByText('Research this scholarship').click();
      await Promise.resolve();
    });

    expect(screen.getByText(/Couldn’t finish that research/)).toBeTruthy();
  });

  it('explains an empty result instead of leaving a blank tab', async () => {
    h.listScholarships.mockResolvedValue(response());
    h.startSearch.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 0, lastRunAt: '2026-08-20T00:00:00Z' } }),
    );

    await renderTab();

    expect(screen.getByText('Nothing found yet')).toBeTruthy();
    expect(screen.getByText(/didn’t turn up/)).toBeTruthy();
  });

  it('sends the chosen category and sport when the user searches again', async () => {
    h.listScholarships.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 0, lastRunAt: '2026-08-20T00:00:00Z' } }),
    );
    h.startSearch.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 0, lastRunAt: '2026-08-20T00:00:00Z' } }),
    );

    await renderTab();

    await act(async () => {
      screen.getByText('Athletic').click();
    });
    const sportInput = screen.getByPlaceholderText('Any sport') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(sportInput, { target: { value: 'rowing' } });
    });
    await act(async () => {
      screen.getByText('Search').click();
      await Promise.resolve();
    });

    expect(h.startSearch).toHaveBeenCalledWith('c1', { category: 'athletic', sport: 'rowing' });
  });
});
