import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState, Field, Input, Modal, Select, Spinner } from '../../shared/ui';
import { CollegeCard } from './CollegeCard';
import { CollegeTable } from './CollegeTable';
import { CollegeForm } from './CollegeForm';
import { CompareView } from './CompareView';
import { DiscoverPanel } from './DiscoverPanel';
import { PROGRAM_TYPE_LABEL, STATUS_META, anyHydrating } from './logic';
import {
  bulkAddColleges,
  createCollege,
  hydrateAll,
  listColleges,
  setTopPick,
} from './api';
import {
  COLLEGE_STATUSES,
  PROGRAM_TYPES,
  type College,
  type CollegeCandidate,
  type CollegeInput,
  type CollegeStatus,
  type ListFilters,
  type ProgramType,
} from './types';

type ViewMode = 'cards' | 'table';

/** College Hub list: discover, add, filter/sort, card/table toggle, compare, bulk refresh. */
export default function CollegeHubPage() {
  const navigate = useNavigate();
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>('cards');
  const [status, setStatus] = useState<CollegeStatus | ''>('');
  const [programType, setProgramType] = useState<ProgramType | ''>('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<NonNullable<ListFilters['sortBy']>>('name');

  const [showDiscover, setShowDiscover] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async (): Promise<College[]> => {
    const list = await listColleges({
      status: status || undefined,
      programType: programType || undefined,
      search: search || undefined,
      sortBy,
    });
    setColleges(list);
    return list;
  }, [status, programType, search, sortBy]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your colleges.');
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // Light poll while any college is mid-hydration (so async refreshes surface without a manual reload).
  useEffect(() => {
    if (!anyHydrating(colleges)) return;
    pollRef.current = setTimeout(() => void refresh(), 4000);
    return () => clearTimeout(pollRef.current);
  }, [colleges, refresh]);

  const compareSet = useMemo(() => new Set(compareIds), [compareIds]);
  const compareColleges = useMemo(
    () => colleges.filter((c) => compareSet.has(c.collegeId)).slice(0, 4),
    [colleges, compareSet],
  );

  function toggleCompare(c: College): void {
    setCompareIds((prev) =>
      prev.includes(c.collegeId) ? prev.filter((id) => id !== c.collegeId) : prev.length >= 4 ? prev : [...prev, c.collegeId],
    );
  }

  async function toggleTopPick(c: College): Promise<void> {
    setColleges((prev) => prev.map((x) => (x.collegeId === c.collegeId ? { ...x, isTopPick: !x.isTopPick } : x)));
    try {
      await setTopPick(c.collegeId, !c.isTopPick);
    } catch {
      void refresh(); // revert to server truth on failure
    }
  }

  async function submitNew(input: CollegeInput): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    try {
      await createCollege(input);
      setShowAdd(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add that college.');
    } finally {
      setSubmitting(false);
    }
  }

  async function addCandidates(chosen: CollegeCandidate[]): Promise<void> {
    try {
      // Map candidates to editable College inputs — drop discovery-only fields (e.g. `summary`) the
      // strict create schema rejects.
      await bulkAddColleges(
        chosen.map(({ name, location, state, programType, isDirectAdmit, hasBSN, ranking, tuitionInState, tuitionOutOfState, website }) => ({
          name,
          location,
          state,
          programType,
          isDirectAdmit,
          hasBSN,
          ranking,
          tuitionInState,
          tuitionOutOfState,
          website,
        })),
      );
      setShowDiscover(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the selected colleges.');
    }
  }

  async function refreshAll(): Promise<void> {
    setRefreshing(true);
    try {
      await hydrateAll();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }

  const hasFilters = Boolean(status || programType || search);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">College Hub</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Research, track, and compare BSN programs on the way to nursing school.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {colleges.length > 0 ? (
            <Button variant="ghost" icon="course" loading={refreshing} onClick={() => void refreshAll()}>
              Refresh all
            </Button>
          ) : null}
          <Button variant="outline" icon="search" onClick={() => setShowDiscover((s) => !s)}>
            Discover
          </Button>
          <Button icon="plus" onClick={() => { setFormError(null); setShowAdd(true); }}>
            Add college
          </Button>
        </div>
      </header>

      {showDiscover ? (
        <DiscoverPanel
          trackedNames={colleges.map((c) => c.name)}
          onAdd={addCandidates}
          onClose={() => setShowDiscover(false)}
        />
      ) : null}

      {colleges.length > 0 || hasFilters ? (
        <Card flush className="p-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Search" className="min-w-[10rem] flex-1">
              <Input placeholder="Name, state, notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value as CollegeStatus | '')}>
                <option value="">All</option>
                {COLLEGE_STATUSES.filter((s) => s !== 'removed').map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Program">
              <Select value={programType} onChange={(e) => setProgramType(e.target.value as ProgramType | '')}>
                <option value="">All</option>
                {PROGRAM_TYPES.map((p) => (
                  <option key={p} value={p}>{PROGRAM_TYPE_LABEL[p]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Sort by">
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as NonNullable<ListFilters['sortBy']>)}>
                <option value="name">Name</option>
                <option value="fitScore">Fit score</option>
                <option value="tuition">Cost</option>
                <option value="status">Status</option>
              </Select>
            </Field>
            <Button
              variant="ghost"
              onClick={() => setView((v) => (v === 'cards' ? 'table' : 'cards'))}
              icon={view === 'cards' ? 'menu' : 'home'}
            >
              {view === 'cards' ? 'Table' : 'Cards'}
            </Button>
          </div>
        </Card>
      ) : null}

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void refresh()}>Retry</Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : colleges.length === 0 ? (
        <EmptyState
          icon="school"
          title={hasFilters ? 'No colleges match your filters' : 'Start building your college list'}
          description={
            hasFilters
              ? 'Try clearing the filters.'
              : 'Discover BSN programs with AI, or add a school by name — we’ll fill in the details automatically.'
          }
          action={
            <div className="flex gap-2">
              <Button icon="search" onClick={() => setShowDiscover(true)}>Discover programs</Button>
              <Button variant="outline" icon="plus" onClick={() => setShowAdd(true)}>Add by name</Button>
            </div>
          }
        />
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {colleges.map((c) => (
            <CollegeCard
              key={c.collegeId}
              college={c}
              selectedForCompare={compareSet.has(c.collegeId)}
              onOpen={(x) => navigate(`/colleges/${x.collegeId}`)}
              onToggleTopPick={(x) => void toggleTopPick(x)}
              onToggleCompare={toggleCompare}
            />
          ))}
        </div>
      ) : (
        <CollegeTable
          colleges={colleges}
          onOpen={(x) => navigate(`/colleges/${x.collegeId}`)}
          onToggleTopPick={(x) => void toggleTopPick(x)}
        />
      )}

      {compareIds.length >= 2 ? (
        <div className="sticky bottom-20 z-fab flex justify-center sm:bottom-4">
          <Button icon="course" onClick={() => setShowCompare(true)} className="shadow-lg">
            Compare {compareColleges.length} colleges
          </Button>
        </div>
      ) : null}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add a college" size="lg">
        <CollegeForm
          createHint
          busy={submitting}
          error={formError}
          onSubmit={(input) => void submitNew(input)}
          onCancel={() => setShowAdd(false)}
        />
      </Modal>

      <CompareView colleges={compareColleges} open={showCompare} onClose={() => setShowCompare(false)} />
    </div>
  );
}
