import { useEffect, useRef, useState } from 'react';
import { Button, Card, Field, Icon, Input, Select, Spinner } from '../../shared/ui';
import { PROGRAM_TYPE_LABEL, costLabel, untrackedCandidates } from './logic';
import { getDiscovery, startDiscovery } from './api';
import { PROGRAM_TYPES, type CollegeCandidate, type DiscoverFilters, type ProgramType } from './types';

const POLL_MS = 3000;
const MAX_POLLS = 60; // ~3 min — web-grounded discovery runs on the 300s worker but is usually <90s

interface Props {
  /** Names already in the tracked list — matching candidates are hidden from results. */
  trackedNames: string[];
  onAdd: (chosen: CollegeCandidate[]) => Promise<void> | void;
  onClose: () => void;
}

/** "Discover BSN Programs" — set filters (or just Find), review AI candidates with checkboxes, and
 *  add all or the selected ones. Discovery adds nothing until the user picks. */
export function DiscoverPanel({ trackedNames, onAdd, onClose }: Props) {
  const [filters, setFilters] = useState<DiscoverFilters>({});
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [results, setResults] = useState<CollegeCandidate[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard against setting state after the panel closes mid-poll.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      // Discovery is async: start a job, then poll until the worker finishes (it searches the web,
      // which can take up to ~90s and exceeds the API's synchronous budget).
      const job = await startDiscovery(filters);
      let current = job;
      for (let i = 0; current.status === 'pending' && i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!aliveRef.current) return;
        current = await getDiscovery(job.jobId);
      }
      if (current.status === 'failed') {
        setError(current.error || 'Discovery failed. Try again.');
        return;
      }
      if (current.status === 'pending') {
        setError('Discovery is taking longer than expected — please try again in a moment.');
        return;
      }
      const found = current.candidates ?? [];
      // Hide candidates already in the list so the user can't re-add a tracked school.
      const fresh = untrackedCandidates(found, trackedNames);
      setHiddenCount(found.length - fresh.length);
      setResults(fresh);
      setSelected(new Set(fresh.map((c) => c.name)));
      setRan(true);
    } catch (err) {
      if (aliveRef.current) setError(err instanceof Error ? err.message : 'Discovery failed. Try again.');
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function add(which: CollegeCandidate[]) {
    setAdding(true);
    try {
      await onAdd(which);
    } finally {
      setAdding(false);
    }
  }

  const chosen = results.filter((c) => selected.has(c.name));

  return (
    <Card className="border border-primary-200 bg-primary-50">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="search" size={18} className="text-primary-600" />
          <h2 className="text-sm font-semibold text-primary-800">Discover BSN programs</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close discovery" className="text-primary-600 hover:text-primary-800">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Keywords" className="min-w-[12rem] flex-1">
          <Input
            placeholder="e.g. small class sizes, strong NCLEX pass rate"
            value={filters.query ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value || undefined }))}
          />
        </Field>
        <Field label="State">
          <Input
            placeholder="Ohio"
            value={filters.state ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value || undefined }))}
          />
        </Field>
        <Field label="Program">
          <Select
            value={filters.programType ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, programType: (e.target.value || undefined) as ProgramType | undefined }))}
          >
            <option value="">Any</option>
            {PROGRAM_TYPES.map((p) => (
              <option key={p} value={p}>
                {PROGRAM_TYPE_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Button icon="search" loading={loading} onClick={() => void run()}>
          {ran ? 'Search again' : 'Find programs'}
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm text-error-600">{error}</p> : null}

      {loading ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <Spinner />
          <p className="text-sm text-primary-700">Searching the web for programs… this can take up to a minute.</p>
        </div>
      ) : ran && results.length === 0 ? (
        <p className="mt-4 text-center text-sm text-primary-700">
          {hiddenCount > 0
            ? `All ${hiddenCount} program${hiddenCount === 1 ? '' : 's'} found are already in your list.`
            : 'No programs came back. Try broadening the filters.'}
        </p>
      ) : results.length > 0 ? (
        <>
          {hiddenCount > 0 ? (
            <p className="mt-3 text-xs text-primary-700">
              {hiddenCount} already in your list {hiddenCount === 1 ? 'was' : 'were'} hidden.
            </p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {results.map((c) => (
              <li key={c.name} className="flex items-start gap-3 rounded-md bg-surface-raised p-3">
                <input
                  type="checkbox"
                  checked={selected.has(c.name)}
                  onChange={() => toggle(c.name)}
                  className="mt-1 h-4 w-4 rounded border-surface-border text-primary-600"
                  aria-label={`Select ${c.name}`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{c.name}</p>
                  <p className="text-xs text-ink-500">
                    {[c.location ?? c.state, c.programType ? PROGRAM_TYPE_LABEL[c.programType] : undefined]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {c.summary ? <p className="mt-1 text-sm text-ink-600">{c.summary}</p> : null}
                  {(c.tuitionOutOfState ?? c.tuitionInState) !== undefined ? (
                    <p className="mt-0.5 text-xs text-ink-500">
                      Tuition ~{costLabel(c.tuitionOutOfState ?? c.tuitionInState)}/yr
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <Button loading={adding} disabled={chosen.length === 0} onClick={() => void add(chosen)}>
              Add selected ({chosen.length})
            </Button>
            <Button variant="outline" loading={adding} onClick={() => void add(results)}>
              Add all ({results.length})
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}
