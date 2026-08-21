// @vitest-environment jsdom
// The tab's state machine is the thing worth locking: it starts NOTHING on open, searches what the
// family actually typed, polls a slow search to completion, and turns a picked award into a polled
// dossier. Each of those is an async round-trip a refactor could silently break.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  listScholarships: vi.fn(),
  startSearch: vi.fn(),
  startResearch: vi.fn(),
  startResearchBatch: vi.fn(),
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

/** Tick an award's checkbox by its accessible name. */
async function pick(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByLabelText(name));
  });
}

/** Nothing runs on open now, so every search-path test has to actually ask for one. */
async function submitSearch(text?: string) {
  if (text !== undefined) {
    await act(async () => {
      fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: text } });
    });
  }
  await act(async () => {
    fireEvent.click(screen.getByText('Search'));
    await Promise.resolve();
  });
}

describe('ScholarshipsTab', () => {
  // The headline behavior change: arriving must not spend a web search on a guess at your intent.
  it('starts NOTHING on open, and invites the family to say what they want', async () => {
    h.listScholarships.mockResolvedValue(response());

    await renderTab();

    expect(h.startSearch).not.toHaveBeenCalled();
    expect(screen.getByText(/Find money for Ohio State/)).toBeTruthy();
  });

  it('does not search on open even for a college that already has results', async () => {
    h.listScholarships.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 1, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [award()] }),
    );

    await renderTab();

    expect(h.startSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Morrill Scholarship')).toBeTruthy();
  });

  it('searches for what the family typed', async () => {
    h.listScholarships.mockResolvedValue(response());
    h.startSearch.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 1, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [award()] }),
    );

    await renderTab();
    const box = screen.getByLabelText('What are you looking for?') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(box, { target: { value: 'soccer' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Search'));
      await Promise.resolve();
    });

    expect(h.startSearch).toHaveBeenCalledWith('c1', { query: 'soccer', category: 'all' });
  });

  it('sweeps everything when asked, sending no query at all', async () => {
    h.listScholarships.mockResolvedValue(response());
    h.startSearch.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 0, lastRunAt: '2026-08-20T00:00:00Z' } }),
    );

    await renderTab();
    await act(async () => {
      fireEvent.click(screen.getByText(/Or search every scholarship/));
      await Promise.resolve();
    });

    expect(h.startSearch).toHaveBeenCalledWith('c1', { category: 'all' });
  });

  it('echoes back what the last run was looking for', async () => {
    h.listScholarships.mockResolvedValue(
      response({
        search: { collegeId: 'c1', status: 'complete', query: 'soccer', found: 1, lastRunAt: '2026-08-20T00:00:00Z' },
        scholarships: [award()],
      }),
    );

    await renderTab();

    expect(screen.getByText(/Showing “soccer”/)).toBeTruthy();
  });

  it('rejoins a search that was already running when the tab opened', async () => {
    h.listScholarships
      .mockResolvedValueOnce(response({ search: { collegeId: 'c1', status: 'in-progress' } }))
      .mockResolvedValueOnce(
        response({ search: { collegeId: 'c1', status: 'complete', found: 1, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [award()] }),
      );

    await renderTab();
    expect(h.startSearch).not.toHaveBeenCalled();
    expect(screen.getByText(/Searching Ohio State/)).toBeTruthy();

    await tick();
    expect(screen.getByText('Morrill Scholarship')).toBeTruthy();
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
    await submitSearch('soccer');
    expect(screen.getByText(/Searching Ohio State/)).toBeTruthy();

    await tick();
    await tick();

    expect(screen.getByText('Morrill Scholarship')).toBeTruthy();
  });

  it('surfaces a failed search with a retry rather than an empty page', async () => {
    h.listScholarships.mockResolvedValue(response());
    h.startSearch.mockResolvedValue(response({ search: { collegeId: 'c1', status: 'failed', error: 'boom' } }));

    await renderTab();
    await submitSearch('soccer');

    expect(screen.getByText(/didn’t finish/)).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
  });

  it('researches every ticked award in one click, polling until the dossiers land', async () => {
    const a = award({ scholarshipId: 's1', name: 'Morrill Scholarship' });
    const b = award({ scholarshipId: 's2', name: 'Rowing Award', category: 'athletic' });
    h.listScholarships.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 2, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [a, b] }),
    );
    h.startResearchBatch.mockResolvedValue({
      started: 2,
      scholarships: [{ ...a, researchStatus: 'in-progress' }, { ...b, researchStatus: 'in-progress' }],
    });

    await renderTab();
    await pick('Morrill Scholarship');
    await pick('Rowing Award');

    expect(screen.getByText('Research 2 scholarships')).toBeTruthy();

    // Once both finish, the poll sees them complete.
    h.listScholarships.mockResolvedValue(
      response({
        search: { collegeId: 'c1', status: 'complete', found: 2, lastRunAt: '2026-08-20T00:00:00Z' },
        scholarships: [
          { ...a, researchStatus: 'complete', research: { summary: 'A full-tuition award.' } },
          { ...b, researchStatus: 'complete', research: { summary: 'A rowing award.' } },
        ],
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Research 2 scholarships'));
      await Promise.resolve();
    });
    expect(h.startResearchBatch).toHaveBeenCalledWith('c1', ['s1', 's2']);

    await tick();

    // Both are marked researched, and the first dossier opens so the result is visible.
    expect(screen.getAllByText('Researched')).toHaveLength(2);
    expect(screen.getByText('A full-tuition award.')).toBeTruthy();
  });

  // Regression: the dossier used to render AFTER the whole list. On a long list, clicking
  // "See details" flipped the label and appeared to do nothing — the content was real, just far
  // below the fold. Asserting the text exists is not enough to catch that; it has to be asserted
  // INSIDE the row it belongs to.
  it('opens the dossier inside the row it belongs to, not at the bottom of the page', async () => {
    const a = award({
      scholarshipId: 's1',
      name: 'Morrill Scholarship',
      researchStatus: 'complete',
      research: { summary: 'A full-tuition award.' },
    });
    const b = award({ scholarshipId: 's2', name: 'Rowing Award', category: 'athletic' });
    h.listScholarships.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 2, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [a, b] }),
    );

    await renderTab();

    // Collapsed to begin with.
    expect(screen.queryByText('A full-tuition award.')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByText('See details'));
    });

    const dossier = screen.getByText('A full-tuition award.');
    const row = screen.getByLabelText('Morrill Scholarship').closest('li');
    expect(row).toBeTruthy();
    expect(row!.contains(dossier)).toBe(true);
  });

  it('collapses the dossier from the row toggle and from the bottom of the dossier', async () => {
    const a = award({
      scholarshipId: 's1',
      name: 'Morrill Scholarship',
      researchStatus: 'complete',
      research: { summary: 'A full-tuition award.' },
    });
    h.listScholarships.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 1, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [a] }),
    );

    await renderTab();
    await act(async () => {
      fireEvent.click(screen.getByText('See details'));
    });
    expect(screen.getByText('A full-tuition award.')).toBeTruthy();

    // The row's own toggle closes it...
    await act(async () => {
      fireEvent.click(screen.getByText('Hide details'));
    });
    expect(screen.queryByText('A full-tuition award.')).toBeNull();

    // ...and so does the Collapse control at the end of a long dossier.
    await act(async () => {
      fireEvent.click(screen.getByText('See details'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Collapse'));
    });
    expect(screen.queryByText('A full-tuition award.')).toBeNull();
  });

  it('keeps the research button disabled until something is ticked', async () => {
    h.listScholarships.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 1, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [award()] }),
    );

    await renderTab();

    expect((screen.getByText('Research').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports a partial failure without hiding the dossiers that did work', async () => {
    const a = award({ scholarshipId: 's1', name: 'Morrill Scholarship' });
    const b = award({ scholarshipId: 's2', name: 'Rowing Award', category: 'athletic' });
    h.listScholarships.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 2, lastRunAt: '2026-08-20T00:00:00Z' }, scholarships: [a, b] }),
    );
    h.startResearchBatch.mockResolvedValue({ started: 2, scholarships: [a, b] });

    await renderTab();
    await pick('Morrill Scholarship');
    await pick('Rowing Award');

    h.listScholarships.mockResolvedValue(
      response({
        search: { collegeId: 'c1', status: 'complete', found: 2, lastRunAt: '2026-08-20T00:00:00Z' },
        scholarships: [
          { ...a, researchStatus: 'complete', research: { summary: 'Worked.' } },
          { ...b, researchStatus: 'failed' },
        ],
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Research 2 scholarships'));
      await Promise.resolve();
    });
    await tick();

    expect(screen.getByText(/1 of 2 couldn’t be researched/)).toBeTruthy();
    expect(screen.getByText('Worked.')).toBeTruthy();
  });

  it('explains an empty result instead of leaving a blank tab', async () => {
    h.listScholarships.mockResolvedValue(response());
    h.startSearch.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 0, lastRunAt: '2026-08-20T00:00:00Z' } }),
    );

    await renderTab();
    await submitSearch();

    expect(screen.getByText('Nothing found yet')).toBeTruthy();
    expect(screen.getByText(/didn’t turn up/)).toBeTruthy();
  });

  it('scopes the search to the chosen category', async () => {
    h.listScholarships.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 0, lastRunAt: '2026-08-20T00:00:00Z' } }),
    );
    h.startSearch.mockResolvedValue(
      response({ search: { collegeId: 'c1', status: 'complete', found: 0, lastRunAt: '2026-08-20T00:00:00Z' } }),
    );

    await renderTab();
    await act(async () => {
      fireEvent.click(screen.getByText('Athletic'));
    });
    await submitSearch('rowing');

    expect(h.startSearch).toHaveBeenCalledWith('c1', { query: 'rowing', category: 'athletic' });
  });

  it('prefills the box with the last search so running it again is one click', async () => {
    h.listScholarships.mockResolvedValue(
      response({
        search: { collegeId: 'c1', status: 'complete', query: 'soccer', found: 1, lastRunAt: '2026-08-20T00:00:00Z' },
        scholarships: [award()],
      }),
    );

    await renderTab();

    expect((screen.getByLabelText('What are you looking for?') as HTMLInputElement).value).toBe('soccer');
  });
});
