import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Modal,
  Select,
  Spinner,
  Table,
  useToast,
  safeHref,
  type Column,
} from '../../shared/ui';
import { deleteVisit, listColleges, listVisits, regeneratePrep } from './api';
import { VisitForm } from './VisitForm';
import {
  buildComparison,
  formatCost,
  sortVisitsByDateDesc,
  totalTravelCost,
  visitedOn,
  visitTypeLabel,
  wouldAttendLabel,
  wouldAttendTone,
  type ComparisonRow,
} from './logic';
import type { CollegeOption, Visit } from './types';

const comparisonColumns: Column<ComparisonRow>[] = [
  { key: 'date', header: 'Date', render: (r) => r.date },
  { key: 'type', header: 'Type', render: (r) => r.type },
  {
    key: 'rating',
    header: 'Verdict',
    render: (r) =>
      r.wouldAttend ? <Badge tone={wouldAttendTone(r.wouldAttend)}>{wouldAttendLabel(r.wouldAttend)}</Badge> : '—',
  },
  { key: 'pros', header: 'Pros', align: 'right', render: (r) => r.pros },
  { key: 'cons', header: 'Cons', align: 'right', render: (r) => r.cons },
  { key: 'cost', header: 'Travel', align: 'right', render: (r) => (r.travelCost != null ? formatCost(r.travelCost) : '—') },
];

/** Campus Visit Planner — pick a college, plan/debrief visits, and get visit prep. */
export default function VisitPlannerPage() {
  const toast = useToast();
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [collegeId, setCollegeId] = useState('');
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loadingColleges, setLoadingColleges] = useState(true);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Visit | null>(null);
  const [expandedPrep, setExpandedPrep] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadingColleges(true);
    listColleges()
      .then((cs) => {
        if (!alive) return;
        setColleges(cs);
        setCollegeId((cur) => cur || (cs[0]?.collegeId ?? ''));
      })
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : 'Could not load colleges.'))
      .finally(() => alive && setLoadingColleges(false));
    return () => {
      alive = false;
    };
  }, []);

  const loadVisits = useCallback(async (id: string) => {
    if (!id) {
      setVisits([]);
      return;
    }
    setLoadingVisits(true);
    setError(null);
    try {
      setVisits(await listVisits(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load visits.');
    } finally {
      setLoadingVisits(false);
    }
  }, []);

  useEffect(() => {
    void loadVisits(collegeId);
  }, [collegeId, loadVisits]);

  const ordered = useMemo(() => sortVisitsByDateDesc(visits), [visits]);
  const visited = useMemo(() => visitedOn(visits), [visits]);
  const comparison = useMemo(() => buildComparison(visits), [visits]);
  const travel = useMemo(() => totalTravelCost(visits), [visits]);

  function openNew(): void {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(v: Visit): void {
    setEditing(v);
    setShowForm(true);
  }

  async function handleDelete(v: Visit): Promise<void> {
    if (!window.confirm(`Delete the ${v.date} visit?`)) return;
    try {
      await deleteVisit(collegeId, v.visitId);
      toast.success('Visit deleted.');
      void loadVisits(collegeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the visit.');
    }
  }

  /** (Re)generate a visit's prep on the server and cache the updated visit in state. */
  async function regenerate(v: Visit): Promise<Visit | null> {
    setRegenerating(v.visitId);
    try {
      const updated = await regeneratePrep(collegeId, v.visitId);
      setVisits((prev) => prev.map((x) => (x.visitId === updated.visitId ? updated : x)));
      return updated;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate prep.');
      return null;
    } finally {
      setRegenerating(null);
    }
  }

  /** Show/hide a visit's saved prep — no server call. Visits saved before prep was cached generate it
   *  once on first open, then it's just a toggle. */
  async function togglePrep(v: Visit): Promise<void> {
    if (expandedPrep.has(v.visitId)) {
      setExpandedPrep((prev) => {
        const next = new Set(prev);
        next.delete(v.visitId);
        return next;
      });
      return;
    }
    if (!v.prep && !(await regenerate(v))) return; // generation failed — don't open an empty panel
    setExpandedPrep((prev) => new Set(prev).add(v.visitId));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Campus Visits</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Plan visits, prep questions to ask, and debrief after.
        </p>
      </header>

      {loadingColleges ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : colleges.length === 0 ? (
        <EmptyState
          icon="school"
          title="No colleges yet"
          description="Add colleges in the College Hub first — then plan visits to them here."
        />
      ) : (
        <>
          <Card flush className="flex flex-wrap items-end gap-3 p-3">
            <Field label="College" className="min-w-[14rem] flex-1">
              <Select value={collegeId} onChange={(e) => setCollegeId(e.target.value)}>
                {colleges.map((c) => (
                  <option key={c.collegeId} value={c.collegeId}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {visited ? <Badge tone="success">Visited on {visited}</Badge> : null}
            {travel > 0 ? <Badge tone="neutral">Travel {formatCost(travel)}</Badge> : null}
            <Button icon="plus" onClick={openNew}>
              Plan visit
            </Button>
          </Card>

          {error ? (
            <Card className="border border-error-200 bg-error-50 text-error-700">
              <p className="text-sm">{error}</p>
              <Button className="mt-2" size="sm" variant="outline" onClick={() => void loadVisits(collegeId)}>
                Retry
              </Button>
            </Card>
          ) : loadingVisits ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : visits.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="No visits planned"
              description="Plan a campus visit and we'll prep questions to ask and logistics for you."
              action={
                <Button icon="plus" onClick={openNew}>
                  Plan your first visit
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {ordered.map((v) => (
                <Card key={v.visitId}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                      <Icon name="calendar" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-ink-900">{visitTypeLabel(v.visitType)}</h3>
                        <span className="text-sm text-ink-500">{v.date}</span>
                        {v.wouldAttend ? (
                          <Badge tone={wouldAttendTone(v.wouldAttend)}>{wouldAttendLabel(v.wouldAttend)}</Badge>
                        ) : null}
                        {typeof v.travelCost === 'number' ? (
                          <Badge tone="neutral">{formatCost(v.travelCost)}</Badge>
                        ) : null}
                      </div>
                      {v.impressions ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{v.impressions}</p>
                      ) : null}
                      {(v.pros?.length ?? 0) > 0 || (v.cons?.length ?? 0) > 0 ? (
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {(v.pros?.length ?? 0) > 0 ? (
                            <div className="text-sm text-success-700">+ {v.pros!.join(', ')}</div>
                          ) : null}
                          {(v.cons?.length ?? 0) > 0 ? (
                            <div className="text-sm text-error-700">− {v.cons!.join(', ')}</div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          icon="check"
                          loading={regenerating === v.visitId && !expandedPrep.has(v.visitId)}
                          onClick={() => void togglePrep(v)}
                        >
                          {expandedPrep.has(v.visitId) ? 'Hide prep' : 'Prep'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                          Edit / debrief
                        </Button>
                        <Button size="sm" variant="ghost" icon="close" aria-label="Delete" onClick={() => void handleDelete(v)} />
                      </div>

                      {expandedPrep.has(v.visitId) && v.prep ? (
                        <div className="mt-3 space-y-3 rounded-lg border border-surface-border bg-surface-sunken p-3 text-sm">
                          <div>
                            <h4 className="font-semibold text-ink-900">Best time</h4>
                            <p className="mt-1 text-ink-700">{v.prep.bestTime}</p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-ink-900">Questions to ask</h4>
                            <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-700">
                              {v.prep.questions.map((q) => (
                                <li key={q}>{q}</li>
                              ))}
                            </ul>
                          </div>
                          {v.prep.logistics.address || v.prep.logistics.contact || v.prep.logistics.campusVisitUrl ? (
                            <div>
                              <h4 className="font-semibold text-ink-900">Logistics</h4>
                              <ul className="mt-1 space-y-0.5 text-ink-700">
                                {v.prep.logistics.address ? <li>📍 {v.prep.logistics.address}</li> : null}
                                {v.prep.logistics.contact ? <li>✉️ {v.prep.logistics.contact}</li> : null}
                                {safeHref(v.prep.logistics.campusVisitUrl) ? (
                                  <li>
                                    🔗{' '}
                                    <a className="text-primary-600 underline" href={safeHref(v.prep.logistics.campusVisitUrl)} target="_blank" rel="noreferrer">
                                      Campus visit page
                                    </a>
                                  </li>
                                ) : null}
                              </ul>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="text-xs text-ink-400">{v.prep.source === 'ai' ? 'Tailored by AI.' : 'Standard checklist.'}</span>
                            <Button size="sm" variant="ghost" loading={regenerating === v.visitId} onClick={() => void regenerate(v)}>
                              Regenerate
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {comparison.length > 1 ? (
            <Card flush>
              <h3 className="px-3 pt-3 text-base font-semibold text-ink-900">Visit comparison</h3>
              <Table columns={comparisonColumns} rows={comparison} rowKey={(r) => r.visitId} />
            </Card>
          ) : null}
        </>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit visit' : 'Plan a visit'}>
        <VisitForm
          collegeId={collegeId}
          visit={editing ?? undefined}
          onSaved={() => {
            setShowForm(false);
            void loadVisits(collegeId);
          }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

    </div>
  );
}
