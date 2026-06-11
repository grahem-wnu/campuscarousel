import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../shared/shell';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Tabs,
  useToast,
  type TabItem,
} from '../../shared/ui';
import { DateField } from '../../shared/ui';
import { deleteClinical, exportPdf, getSummary, getSupervisors, listClinical } from './api';
import { ClinicalCard } from './ClinicalCard';
import { LogForm } from './LogForm';
import { SummaryView } from './SummaryView';
import { SupervisorDirectory } from './SupervisorDirectory';
import { canSetPrivate, filterBySearch, pdfBlob, sortByDateDesc } from './logic';
import type { Clinical, ClinicalSummary, SupervisorEntry } from './types';

type TabId = 'log' | 'summary' | 'supervisors';

/** Clinical Hours — structured log, summary dashboard, supervisor directory, PDF export. */
export default function ClinicalPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canModify = canSetPrivate(user?.role); // only the student edits/deletes her own entries

  const [entries, setEntries] = useState<Clinical[]>([]);
  const [summary, setSummary] = useState<ClinicalSummary | null>(null);
  const [supervisors, setSupervisors] = useState<SupervisorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>('log');
  const [facility, setFacility] = useState('');
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, sum, sups] = await Promise.all([
        listClinical({
          facility: facility || undefined,
          department: department || undefined,
          from: from || undefined,
          to: to || undefined,
        }),
        getSummary(),
        getSupervisors(),
      ]);
      setEntries(items);
      setSummary(sum);
      setSupervisors(sups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your clinical hours.');
    } finally {
      setLoading(false);
    }
  }, [facility, department, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => sortByDateDesc(filterBySearch(entries, search)), [entries, search]);
  // Options come from the summary (the full visibility-filtered set) so the dropdowns don't shrink
  // to the current selection once a filter is applied.
  const facilityOptions = useMemo(
    () => (summary ? Object.keys(summary.hoursByFacility).sort((a, b) => (a < b ? -1 : 1)) : []),
    [summary],
  );
  const departmentOptions = useMemo(
    () =>
      summary
        ? Object.keys(summary.hoursByDepartment)
            .filter((d) => d !== 'Unspecified')
            .sort((a, b) => (a < b ? -1 : 1))
        : [],
    [summary],
  );
  const hasFilters = Boolean(facility || department || search || from || to);

  const tabs: TabItem[] = [
    { id: 'log', label: 'Log', count: visible.length },
    { id: 'summary', label: 'Summary' },
    { id: 'supervisors', label: 'Supervisors', count: supervisors.length },
  ];

  function clearFilters(): void {
    setFacility('');
    setDepartment('');
    setSearch('');
    setFrom('');
    setTo('');
  }

  async function handleDelete(entry: Clinical): Promise<void> {
    if (!window.confirm(`Delete the ${entry.date} entry at ${entry.facility}?`)) return;
    try {
      await deleteClinical(entry.entryId);
      toast.success('Entry deleted.');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the entry.');
    }
  }

  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      const result = await exportPdf({
        facility: facility || undefined,
        department: department || undefined,
        from: from || undefined,
        to: to || undefined,
        studentName: user?.username,
      });
      const url = URL.createObjectURL(pdfBlob(result.base64, result.contentType));
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export the PDF.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Experience Hours</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Structured experience hours in the format programs want — facility, supervisor, duties, reflections.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon="application" loading={exporting} onClick={() => void handleExport()}>
            Export PDF
          </Button>
          <Button icon="plus" onClick={() => setShowAdd(true)}>
            Log hours
          </Button>
        </div>
      </header>

      <Card flush className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search" className="min-w-[12rem] flex-1">
            <Input
              placeholder="Search facility, supervisor, duties…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Facility">
            <Select value={facility} onChange={(e) => setFacility(e.target.value)}>
              <option value="">All</option>
              {facilityOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department">
            <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All</option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <DateField label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
          <DateField label="To" value={to} onChange={(e) => setTo(e.target.value)} />
          {hasFilters ? (
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </div>
      </Card>

      <Tabs items={tabs} value={tab} onChange={(id) => setTab(id as TabId)} />

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
      ) : tab === 'summary' ? (
        summary ? (
          <SummaryView summary={summary} />
        ) : null
      ) : tab === 'supervisors' ? (
        <SupervisorDirectory supervisors={supervisors} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="clinical"
          title={hasFilters ? 'No entries match your filters' : 'Start logging clinical hours'}
          description={
            hasFilters
              ? 'Try clearing the filters to see everything.'
              : 'Log each shift — facility, supervisor, hours, and what you did. It builds the experience record programs ask for.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button icon="plus" onClick={() => setShowAdd(true)}>
                Log your first hours
              </Button>
            )
          }
        />
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">No entries match your search.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((entry) => (
            <ClinicalCard key={entry.entryId} entry={entry} canModify={canModify} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Log clinical hours">
        <LogForm
          facilities={facilityOptions}
          onCreated={() => {
            setShowAdd(false);
            void load();
          }}
          onCancel={() => setShowAdd(false)}
        />
      </Modal>
    </div>
  );
}
