import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, type TabItem, Tabs } from '../../shared/ui';
import { createScholarship, getSummary, listScholarships, updateScholarship } from './api';
import { ScholarshipCard } from './ScholarshipCard';
import { ScholarshipDetail } from './ScholarshipDetail';
import { ScholarshipForm, emptyForm, type ScholarshipFormValues } from './ScholarshipForm';
import { DiscoverScholarships } from './DiscoverScholarships';
import { BudgetWhatIf } from './BudgetWhatIf';
import { TYPE_META, STATUS_META, filterBySearch, formatAmount, sortScholarships, type SortKey } from './logic';
import { STATUSES, TYPES, type Scholarship, type ScholarshipInput, type ScholarshipSummary, type ScholarshipType, type Status } from './types';

const TODAY = new Date().toISOString().slice(0, 10);
type ViewId = 'list' | 'budget';

function toFormValues(s: Scholarship): ScholarshipFormValues {
  return emptyForm({
    name: s.name,
    provider: s.provider ?? '',
    amount: s.amount != null ? String(s.amount) : '',
    amountDescription: s.amountDescription ?? '',
    type: s.type ?? '',
    status: s.status ?? 'discovered',
    applicationDeadline: s.applicationDeadline ?? '',
    applicationUrl: s.applicationUrl ?? '',
    eligibility: (s.eligibility ?? []).join('\n'),
    requiredMaterials: (s.requiredMaterials ?? []).join('\n'),
    notes: s.notes ?? '',
  });
}

/** Scholarship Tracker — discover, list (sortable/filterable, color-coded deadlines), totals, detail,
 *  and a what-if budget view. */
export default function ScholarshipsPage() {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [summary, setSummary] = useState<ScholarshipSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewId>('list');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ScholarshipType | ''>('');
  const [status, setStatus] = useState<Status | ''>('');
  const [sort, setSort] = useState<SortKey>('deadline');

  const [showCreate, setShowCreate] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [selected, setSelected] = useState<Scholarship | null>(null);
  const [editing, setEditing] = useState<Scholarship | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, sum] = await Promise.all([
        listScholarships({ type: type || undefined, status: status || undefined }),
        getSummary(),
      ]);
      setScholarships(list);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your scholarships.');
    } finally {
      setLoading(false);
    }
  }, [type, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => sortScholarships(filterBySearch(scholarships, search), sort, TODAY),
    [scholarships, search, sort],
  );

  function applyUpdate(u: Scholarship) {
    setScholarships((p) => p.map((s) => (s.scholarshipId === u.scholarshipId ? u : s)));
    setSelected((p) => (p?.scholarshipId === u.scholarshipId ? u : p));
    void refreshSummary();
  }
  function applyDelete(id: string) {
    setScholarships((p) => p.filter((s) => s.scholarshipId !== id));
    setSelected(null);
    void refreshSummary();
  }
  async function refreshSummary() {
    try {
      setSummary(await getSummary());
    } catch {
      /* non-fatal */
    }
  }

  async function handleCreate(input: ScholarshipInput) {
    await createScholarship(input);
    setShowCreate(false);
    await load();
  }
  async function handleEditSave(input: ScholarshipInput) {
    if (!editing) return;
    const updated = await updateScholarship(editing.scholarshipId, input);
    applyUpdate(updated);
    setEditing(null);
  }

  const hasFilters = Boolean(search || type || status);
  const views: TabItem[] = [
    { id: 'list', label: 'Scholarships', count: scholarships.length },
    { id: 'budget', label: 'Budget impact' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Scholarships</h1>
          <p className="mt-0.5 text-sm text-ink-500">Discover and track scholarships to stretch the budget.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon="search" onClick={() => setShowDiscover(true)}>
            Discover
          </Button>
          <Button icon="plus" onClick={() => setShowCreate(true)}>
            Add scholarship
          </Button>
        </div>
      </header>

      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card flush className="p-3">
            <div className="text-xs text-ink-500">Tracked</div>
            <div className="text-xl font-bold text-ink-900">{summary.totalTracked}</div>
          </Card>
          <Card flush className="p-3">
            <div className="text-xs text-ink-500">Potential value</div>
            <div className="text-xl font-bold text-ink-900">{formatAmount(summary.totalPotential)}</div>
          </Card>
          <Card flush className="p-3">
            <div className="text-xs text-ink-500">Awarded</div>
            <div className="text-xl font-bold text-success-700">{formatAmount(summary.totalAwarded)}</div>
          </Card>
        </div>
      ) : null}

      <Tabs items={views} value={view} onChange={(id) => setView(id as ViewId)} />

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : view === 'budget' ? (
        summary ? <BudgetWhatIf summary={summary} /> : null
      ) : scholarships.length === 0 ? (
        <EmptyState
          icon="scholarship"
          title="No scholarships yet"
          description="Discover scholarships with AI web search, or add ones you've found. Every award stretches the budget."
          action={
            <div className="flex gap-2">
              <Button variant="outline" icon="search" onClick={() => setShowDiscover(true)}>
                Discover
              </Button>
              <Button icon="plus" onClick={() => setShowCreate(true)}>
                Add your first scholarship
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <Card flush className="p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Search" className="min-w-[12rem] flex-1">
                <Input placeholder="Search name, provider, notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </Field>
              <Field label="Type">
                <Select value={type} onChange={(e) => setType(e.target.value as ScholarshipType | '')}>
                  <option value="">All</option>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_META[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value as Status | '')}>
                  <option value="">All</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sort by">
                <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="deadline">Deadline</option>
                  <option value="amount">Amount</option>
                  <option value="status">Status</option>
                </Select>
              </Field>
              {hasFilters ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearch('');
                    setType('');
                    setStatus('');
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </Card>

          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">No scholarships match your filters.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visible.map((s) => (
                <ScholarshipCard key={s.scholarshipId} scholarship={s} today={TODAY} onOpen={setSelected} />
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add scholarship" size="lg">
        <ScholarshipForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
      </Modal>

      <Modal open={showDiscover} onClose={() => setShowDiscover(false)} title="Discover scholarships" size="lg">
        <DiscoverScholarships
          onCancel={() => setShowDiscover(false)}
          onSaved={() => {
            setShowDiscover(false);
            void load();
          }}
        />
      </Modal>

      <Modal open={Boolean(selected) && !editing} onClose={() => setSelected(null)} title={selected?.name} size="lg">
        {selected ? (
          <ScholarshipDetail
            scholarship={selected}
            today={TODAY}
            onUpdated={applyUpdate}
            onDeleted={applyDelete}
            onEdit={(s) => setEditing(s)}
          />
        ) : null}
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit scholarship" size="lg">
        {editing ? (
          <ScholarshipForm
            initial={toFormValues(editing)}
            submitLabel="Save changes"
            onSubmit={handleEditSave}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
