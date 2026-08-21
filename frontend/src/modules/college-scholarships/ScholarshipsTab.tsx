// The Scholarships tab on a college. Two AI passes, two progress states:
//
//   1. SEARCH — the family says what they're after ("soccer", "nursing") or asks for everything, and
//      a web-grounded search finds what this school offers. INTENT-FIRST: nothing runs until they
//      ask. An earlier version searched automatically on open, which pre-empted the search the
//      person actually came here to type and spent a web-search call they never requested.
//   2. RESEARCH — tick the awards worth a closer look and research them together. Each one is its
//      own job, so dossiers land one at a time rather than all at the end.
//
// Both run on the backend worker (60-180s), so this component starts a job and then polls until the
// status settles. Every poll is guarded by a mounted ref, because a family will absolutely click
// away while a two-minute search runs.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Chip, Field, Icon, Input, Spinner, safeHref, useToast } from '../../shared/ui';
import {
  deleteScholarship,
  listScholarships,
  startResearchBatch,
  startSearch,
  trackScholarship,
} from './api';
import {
  MAX_RESEARCH_BATCH,
  SEARCH_CATEGORY_LABEL,
  emptyMessage,
  groupByCategory,
  hasResearch,
  lastRunLabel,
  researchBusy,
  researchButtonLabel,
  researchProgress,
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
  // Multi-select: researching several awards from one click is the normal case, since a family is
  // usually weighing a shortlist rather than one award.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Which dossier is expanded. Several can be complete at once, so they collapse by default. */
  const [openId, setOpenId] = useState<string>('');
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

  const groups = groupByCategory(scholarships);
  const selectedIds = [...selected];
  const researched = scholarships.filter((s) => hasResearch(s));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      // Cap client-side too, so the button never sends a request the API will reject.
      else if (next.size < MAX_RESEARCH_BATCH) next.add(id);
      return next;
    });

  /** Apply a fresh list response, keeping the current selection when it still exists. */
  const apply = useCallback((res: { search: ScholarshipSearchState | null; scholarships: CollegeScholarship[] }) => {
    setSearch(res.search);
    setScholarships(res.scholarships);
    // Drop selections for awards a re-search removed, so the count can't drift from what's shown.
    setSelected((prev) => {
      const alive = new Set(res.scholarships.map((s) => s.scholarshipId));
      return new Set([...prev].filter((id) => alive.has(id)));
    });
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

  /** Research every ticked award. Each gets its own job on the backend, so they land one at a time;
   *  this polls the whole list and lets the UI fill in as each dossier arrives. */
  async function researchSelected(): Promise<void> {
    if (selectedIds.length === 0) return;
    const ids = selectedIds;
    setResearching(true);
    setError(null);
    try {
      const res = await startResearchBatch(collegeId, ids);
      if (!mounted.current) return;
      setScholarships(res.scholarships);
      for (let i = 0; i < RESEARCH_POLLS; i++) {
        await sleep(POLL_MS);
        if (!mounted.current) return;
        let fresh;
        try {
          fresh = await listScholarships(collegeId);
        } catch {
          continue; // transient read error — keep waiting
        }
        if (!mounted.current) return;
        setScholarships(fresh.scholarships);
        const { pending, failed, done } = researchProgress(fresh.scholarships, ids);
        if (pending === 0) {
          // Only complain when nothing at all worked; a partial result is still worth showing.
          if (done === 0 && failed > 0) setError(RESEARCH_ERR);
          else if (failed > 0) setError(`${failed} of ${ids.length} couldn’t be researched — try those again.`);
          // Open the first finished dossier so the result is visible without another click.
          const first = fresh.scholarships.find((x) => ids.includes(x.scholarshipId) && hasResearch(x));
          if (first) setOpenId((prev) => prev || first.scholarshipId);
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

  async function onTrack(award: CollegeScholarship): Promise<void> {
    try {
      await trackScholarship(award, collegeName);
      toast.success(`Added “${award.name}” to your scholarship tracker.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not track that scholarship.');
    }
  }

  async function onRemove(award: CollegeScholarship): Promise<void> {
    const { scholarshipId, name } = award;
    try {
      await deleteScholarship(collegeId, scholarshipId);
      if (!mounted.current) return;
      setScholarships((prev) => prev.filter((s) => s.scholarshipId !== scholarshipId));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(scholarshipId);
        return next;
      });
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

      {/* --- pick as many as you want --------------------------------------------------- */}
      {scholarships.length > 0 ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink-800">
              Pick the ones worth a closer look
              {selected.size > 0 ? <span className="ml-1 font-normal text-ink-500">· {selected.size} selected</span> : null}
            </h3>
            <Button
              size="sm"
              icon="search"
              disabled={selected.size === 0}
              loading={researching}
              onClick={() => void researchSelected()}
            >
              {researchButtonLabel(selected.size)}
            </Button>
          </div>

          {groups.map((g) => (
            <div key={g.category}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                {g.label} ({g.items.length})
              </p>
              <ul className="divide-y divide-surface-border rounded-lg border border-surface-border">
                {g.items.map((sch) => {
                  const meta = scholarshipMeta(sch);
                  const done = hasResearch(sch);
                  const busyOne = researchBusy(sch);
                  return (
                    <li key={sch.scholarshipId} className="flex items-start gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-primary-600"
                        checked={selected.has(sch.scholarshipId)}
                        onChange={() => toggle(sch.scholarshipId)}
                        aria-label={sch.name}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium text-ink-900">{sch.name}</span>
                          {busyOne ? (
                            <Badge tone="info">Researching…</Badge>
                          ) : done ? (
                            <Badge tone="success">Researched</Badge>
                          ) : sch.researchStatus === 'failed' ? (
                            <Badge tone="error">Didn’t finish</Badge>
                          ) : null}
                        </div>
                        {meta.length > 0 ? <p className="text-xs text-ink-600">{meta.join(' · ')}</p> : null}
                        {sch.summary ? <p className="mt-0.5 text-xs text-ink-500">{sch.summary}</p> : null}
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          {done ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-primary-600 hover:text-primary-700"
                              onClick={() => setOpenId((prev) => (prev === sch.scholarshipId ? '' : sch.scholarshipId))}
                            >
                              {openId === sch.scholarshipId ? 'Hide details' : 'See details'}
                            </button>
                          ) : null}
                          {done ? (
                            <button
                              type="button"
                              className="text-xs text-primary-600 hover:text-primary-700"
                              onClick={() => void onTrack(sch)}
                            >
                              Track this
                            </button>
                          ) : null}
                          {safeHref(sch.url) ? (
                            <a
                              className="text-xs text-primary-600 hover:underline"
                              href={safeHref(sch.url)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Scholarship page
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="ml-auto text-xs text-ink-400 hover:text-error-600"
                            onClick={() => void onRemove(sch)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {selected.size >= MAX_RESEARCH_BATCH ? (
            <p className="text-xs text-ink-400">
              That’s the most we’ll research in one go — each one is its own couple of minutes of web research.
            </p>
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

      {/* --- research progress + the dossiers -------------------------------------------- */}
      {researching ? (
        <Card className="flex items-center gap-3">
          <Spinner size={18} />
          <div>
            <p className="text-sm font-medium text-ink-800">
              Researching {selectedIds.length} scholarship{selectedIds.length === 1 ? '' : 's'}…{' '}
              {(() => {
                const { done, total } = researchProgress(scholarships, selectedIds);
                return `${done} of ${total} done`;
              })()}
            </p>
            <p className="text-xs text-ink-500">
              Each one is read from the school’s own pages — the odds, the criteria, the process, and who to contact.
              They finish one at a time, so results appear as they land.
            </p>
          </div>
        </Card>
      ) : null}

      {researched.map((sch) =>
        openId === sch.scholarshipId && sch.research ? (
          <div key={sch.scholarshipId} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink-900">{sch.name}</h3>
              <button
                type="button"
                className="text-xs text-ink-400 hover:text-ink-700"
                onClick={() => setOpenId('')}
              >
                Hide
              </button>
            </div>
            <ResearchView research={sch.research} />
          </div>
        ) : null,
      )}
    </div>
  );
}
