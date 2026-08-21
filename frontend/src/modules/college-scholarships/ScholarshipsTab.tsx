// The Scholarships tab on a college. Two AI passes, two progress states:
//
//   1. SEARCH — the family says what they're after ("soccer", "nursing") or asks for everything, and
//      a web-grounded search finds what this school offers. INTENT-FIRST: nothing runs until they
//      ask. An earlier version searched automatically on open, which pre-empted the search the
//      person actually came here to type and spent a web-search call they never requested.
//   2. RESEARCH — pick one award from the dropdown, and get the full dossier on it.
//
// Both run on the backend worker (60-180s), so this component starts a job and then polls until the
// status settles. Every poll is guarded by a mounted ref, because a family will absolutely click
// away while a two-minute search runs.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Chip, Field, Icon, Input, Select, Spinner, safeHref, useToast } from '../../shared/ui';
import {
  deleteScholarship,
  getScholarship,
  listScholarships,
  startResearch,
  startSearch,
  trackScholarship,
} from './api';
import {
  CATEGORY_LABEL,
  SEARCH_CATEGORY_LABEL,
  emptyMessage,
  groupByCategory,
  hasResearch,
  lastRunLabel,
  researchBusy,
  scholarshipMeta,
  searchBusy,
  searchScopeLabel,
} from './logic';
import { ResearchView } from './ResearchView';
import { SEARCH_CATEGORIES, type CollegeScholarship, type ScholarshipSearchState, type SearchCategory } from './types';

/** Poll cadence and caps. The jobs are web-grounded and genuinely slow; these ceilings are generous
 *  enough to cover a bad day without spinning forever. */
const POLL_MS = 5000;
const SEARCH_POLLS = 40; // ~3.5 min
const RESEARCH_POLLS = 48; // ~4 min

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SEARCH_ERR = 'That search didn’t finish. Try again in a moment.';
const RESEARCH_ERR = 'Couldn’t finish that research — try again in a moment.';

export function ScholarshipsTab({ collegeId, collegeName }: { collegeId: string; collegeName: string }) {
  const toast = useToast();
  const [search, setSearch] = useState<ScholarshipSearchState | null>(null);
  const [scholarships, setScholarships] = useState<CollegeScholarship[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const selected = scholarships.find((s) => s.scholarshipId === selectedId) ?? null;
  const groups = groupByCategory(scholarships);

  /** Apply a fresh list response, keeping the current selection when it still exists. */
  const apply = useCallback((res: { search: ScholarshipSearchState | null; scholarships: CollegeScholarship[] }) => {
    setSearch(res.search);
    setScholarships(res.scholarships);
    setSelectedId((prev) => (prev && res.scholarships.some((s) => s.scholarshipId === prev) ? prev : ''));
  }, []);

  /** Poll the list until the search settles (or we run out of patience). */
  const pollSearch = useCallback(async () => {
    for (let i = 0; i < SEARCH_POLLS; i++) {
      await sleep(POLL_MS);
      if (!mounted.current) return;
      let res;
      try {
        res = await listScholarships(collegeId);
      } catch {
        continue; // transient read error — keep waiting
      }
      if (!mounted.current) return;
      apply(res);
      if (!searchBusy(res.search)) {
        if (res.search?.status === 'failed') setError(SEARCH_ERR);
        return;
      }
    }
    if (mounted.current) setError('Still searching — check back in a minute.');
  }, [collegeId, apply]);

  const runSearch = useCallback(
    async (opts: { query?: string; category: SearchCategory }) => {
      setSearching(true);
      setError(null);
      try {
        const res = await startSearch(collegeId, opts);
        if (!mounted.current) return;
        apply(res);
        // Normally the job is queued and we poll. But when the backend ran it inline (no queue
        // configured, or the enqueue fell back) it can come back already settled — a failure there
        // has nothing to poll, so report it here or the tab would silently show nothing.
        if (searchBusy(res.search)) await pollSearch();
        else if (res.search?.status === 'failed') setError(SEARCH_ERR);
      } catch (err) {
        if (mounted.current) setError(err instanceof Error ? err.message : 'Could not start the search.');
      } finally {
        if (mounted.current) setSearching(false);
      }
    },
    [collegeId, apply, pollSearch],
  );

  // First load: read what's already stored, and nothing more. Opening the tab must never START a
  // search — the person came here to say what they're looking for, and running a generic sweep at
  // them both pre-empts that and spends a web-search call they didn't ask for. The one exception is
  // rejoining a run that is already in flight (another tab, or a reload part-way through).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await listScholarships(collegeId);
        if (cancelled || !mounted.current) return;
        apply(res);
        // Prefill the box with whatever was last searched, so "search again" is one click.
        if (res.search?.query) setQuery(res.search.query);
        if (res.search?.category) setCategory(res.search.category);
        if (searchBusy(res.search)) {
          setSearching(true);
          void pollSearch().finally(() => {
            if (mounted.current) setSearching(false);
          });
        }
      } catch (err) {
        if (!cancelled && mounted.current) {
          setError(err instanceof Error ? err.message : 'Could not load scholarships.');
        }
      } finally {
        if (!cancelled && mounted.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collegeId, apply, pollSearch]);

  /** Kick off the dossier for the selected award and poll it to completion. */
  async function research(): Promise<void> {
    if (!selected) return;
    const scholarshipId = selected.scholarshipId;
    setResearching(true);
    setError(null);
    try {
      const started = await startResearch(collegeId, scholarshipId);
      if (!mounted.current) return;
      const merge = (fresh: CollegeScholarship) =>
        setScholarships((prev) => prev.map((s) => (s.scholarshipId === scholarshipId ? fresh : s)));
      merge(started);
      if (!researchBusy(started)) {
        if (started.researchStatus === 'failed') setError(RESEARCH_ERR);
        return;
      }
      for (let i = 0; i < RESEARCH_POLLS; i++) {
        await sleep(POLL_MS);
        if (!mounted.current) return;
        let fresh;
        try {
          fresh = await getScholarship(collegeId, scholarshipId);
        } catch {
          continue;
        }
        if (!mounted.current) return;
        merge(fresh);
        if (fresh.researchStatus === 'complete') return;
        if (fresh.researchStatus === 'failed') {
          setError(RESEARCH_ERR);
          return;
        }
      }
      if (mounted.current) setError('Still researching — check back in a minute.');
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : RESEARCH_ERR);
    } finally {
      if (mounted.current) setResearching(false);
    }
  }

  async function onTrack(): Promise<void> {
    if (!selected) return;
    try {
      await trackScholarship(selected, collegeName);
      toast.success(`Added “${selected.name}” to your scholarship tracker.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not track that scholarship.');
    }
  }

  async function onRemove(): Promise<void> {
    if (!selected) return;
    const { scholarshipId, name } = selected;
    try {
      await deleteScholarship(collegeId, scholarshipId);
      if (!mounted.current) return;
      setScholarships((prev) => prev.filter((s) => s.scholarshipId !== scholarshipId));
      setSelectedId('');
      toast.success(`Removed “${name}”.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove that scholarship.');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={24} />
      </div>
    );
  }

  const busy = searching || searchBusy(search);
  const lastRun = lastRunLabel(search?.lastRunAt);
  const scope = searchScopeLabel(search);

  return (
    <div className="space-y-4">
      {/* --- search controls ------------------------------------------------------------- */}
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-800">Scholarships at {collegeName}</h2>

        {/* The search box leads: this tab is intent-first, and typing then pressing Enter is the
            fastest path for someone who already knows what they want. */}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void runSearch({ query, category });
          }}
        >
          <div className="min-w-[12rem] flex-1">
            <Field
              label="What are you looking for?"
              hint="A sport, a major, an activity, a background — or leave it blank for everything."
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. soccer, nursing, first-generation, marching band"
                maxLength={200}
                aria-label="What are you looking for?"
              />
            </Field>
          </div>
          <Button type="submit" icon="search" loading={busy} className="mb-0.5">
            Search
          </Button>
        </form>

        {/* Secondary: the broad sweep, and the scope filter. Kept visually quieter than the box so
            the typed search stays the obvious primary action. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setQuery('');
              void runSearch({ category });
            }}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
          >
            Or search every scholarship at this school →
          </button>
          <span className="flex flex-wrap items-center gap-1.5">
            {SEARCH_CATEGORIES.map((c) => (
              <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
                {SEARCH_CATEGORY_LABEL[c]}
              </Chip>
            ))}
          </span>
        </div>

        {busy ? (
          <div className="flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-600">
            <Spinner size={15} />
            <span>
              Searching {collegeName} for {query.trim() ? `“${query.trim()}”` : 'every scholarship it offers'}… this
              takes a minute or two.
            </span>
          </div>
        ) : scope ? (
          <p className="text-xs text-ink-400">
            Showing {scope}
            {lastRun ? ` · searched ${lastRun}` : ''}
            {typeof search?.found === 'number' ? ` · ${search.found} found` : ''}
          </p>
        ) : null}

        {error ? <p className="text-xs text-error-600">{error}</p> : null}
      </Card>

      {/* --- pick one ------------------------------------------------------------------- */}
      {scholarships.length > 0 ? (
        <Card className="space-y-3">
          <Field label="Pick a scholarship to research">
            <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select a scholarship…</option>
              {groups.map((g) => (
                <optgroup key={g.category} label={`${g.label} (${g.items.length})`}>
                  {g.items.map((s) => (
                    <option key={s.scholarshipId} value={s.scholarshipId}>
                      {s.name}
                      {s.research ? ' ✓' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          {selected ? (
            <div className="space-y-2 rounded-lg border border-surface-border bg-surface-sunken p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold text-ink-900">{selected.name}</span>
                {selected.category ? (
                  <span className="text-xs text-ink-400">{CATEGORY_LABEL[selected.category]}</span>
                ) : null}
              </div>
              {selected.provider ? <p className="text-xs text-ink-500">{selected.provider}</p> : null}
              {selected.summary ? <p className="text-sm text-ink-700">{selected.summary}</p> : null}
              {scholarshipMeta(selected).length > 0 ? (
                <p className="text-xs text-ink-600">{scholarshipMeta(selected).join(' · ')}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  icon="search"
                  loading={researching || researchBusy(selected)}
                  onClick={() => void research()}
                >
                  {hasResearch(selected) ? 'Research again' : 'Research'}
                </Button>
                {hasResearch(selected) ? (
                  <Button size="sm" variant="outline" icon="scholarship" onClick={() => void onTrack()}>
                    Track this
                  </Button>
                ) : null}
                {safeHref(selected.url) ? (
                  <a
                    className="text-xs text-primary-600 hover:underline"
                    href={safeHref(selected.url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Scholarship page
                  </a>
                ) : null}
                <button
                  type="button"
                  className="ml-auto text-xs text-ink-400 hover:text-error-600"
                  onClick={() => void onRemove()}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : !busy ? (
        // Two different empty states. Before any search this is an invitation, not a failure — the
        // tab is intent-first, so "nothing here" is simply the starting position.
        <Card className="space-y-2 text-center">
          {search?.lastRunAt ? (
            <>
              <p className="text-sm font-medium text-ink-800">Nothing found yet</p>
              <p className="mx-auto max-w-md text-xs text-ink-500">{emptyMessage(search, category)}</p>
              <p className="mx-auto max-w-md text-xs text-ink-500">
                Try different words, or search every scholarship at this school.
              </p>
            </>
          ) : (
            <>
              <Icon name="scholarship" size={22} className="mx-auto text-primary-500" />
              <p className="text-sm font-medium text-ink-800">Find money for {collegeName}</p>
              <p className="mx-auto max-w-md text-xs text-ink-500">
                Say what you’re after — a sport, a major, an activity, something about your background — and we’ll
                search this school for awards that fit. Or search everything it offers and browse.
              </p>
            </>
          )}
        </Card>
      ) : null}

      {/* --- the dossier ---------------------------------------------------------------- */}
      {selected ? (
        researching || researchBusy(selected) ? (
          <Card className="flex items-center gap-3">
            <Spinner size={18} />
            <div>
              <p className="text-sm font-medium text-ink-800">Researching “{selected.name}”…</p>
              <p className="text-xs text-ink-500">
                Reading the school’s pages for the odds, the criteria, the process, and who to contact. A couple of
                minutes.
              </p>
            </div>
          </Card>
        ) : hasResearch(selected) && selected.research ? (
          <ResearchView research={selected.research} />
        ) : (
          <Card className="space-y-2 text-center">
            <Icon name="scholarship" size={22} className="mx-auto text-primary-500" />
            <p className="text-sm font-medium text-ink-800">Research “{selected.name}”</p>
            <p className="mx-auto max-w-md text-xs text-ink-500">
              We’ll dig up what the award really is, your realistic odds, what wins it, how to apply, the dates that
              matter, and the actual people to contact.
            </p>
            <Button className="mt-1" icon="search" loading={researching} onClick={() => void research()}>
              Research this scholarship
            </Button>
          </Card>
        )
      ) : null}
    </div>
  );
}
