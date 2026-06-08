import { useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, Icon, Input, Select, Spinner, Table, useToast, type Column } from '../../shared/ui';
import { DECISION_META, netCostLabel } from './logic';
import { createApplication, deleteApplication, getDecisionMatrix, listApplications, updateApplication } from './api';
import { APPLICATION_DECISIONS, type Application, type ApplicationDecision, type DecisionRow } from './types';

/** Decision matrix — record each application's decision and compare the offers (net cost, fit) side
 *  by side once acceptances arrive. The matrix is derived server-side from decided applications. */
export function DecisionMatrix() {
  const toast = useToast();
  const [apps, setApps] = useState<Application[]>([]);
  const [matrix, setMatrix] = useState<DecisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [collegeId, setCollegeId] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    setError(null);
    try {
      const [a, m] = await Promise.all([listApplications(), getDecisionMatrix()]);
      setApps(a);
      setMatrix(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load applications.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function add() {
    const id = collegeId.trim();
    if (!id) return;
    setAdding(true);
    try {
      await createApplication({ collegeId: id });
      setCollegeId('');
      await load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not add application.', 'error');
    } finally {
      setAdding(false);
    }
  }

  async function setDecision(app: Application, decision: ApplicationDecision) {
    await updateApplication(app.applicationId, { decision });
    await load(); // refresh the derived matrix too
  }

  async function remove(app: Application) {
    await deleteApplication(app.applicationId);
    await load();
  }

  const columns: Column<DecisionRow>[] = [
    {
      key: 'college',
      header: 'College',
      render: (r) => (
        <span className="flex items-center gap-1.5 font-medium text-ink-900">
          {r.isTopPick ? <Icon name="star-filled" size={14} className="text-warn-500" /> : null}
          {r.name}
        </span>
      ),
    },
    { key: 'decision', header: 'Decision', render: (r) => <Badge tone={DECISION_META[r.decision].tone}>{DECISION_META[r.decision].label}</Badge> },
    { key: 'cost', header: 'Net cost', align: 'right', render: (r) => netCostLabel(r.estimatedCostAfterAid, r.estimatedTotalCost) },
    { key: 'fit', header: 'Fit', align: 'right', render: (r) => (r.fitScore ?? '—') },
    { key: 'rank', header: 'Ranking', render: (r) => r.ranking ?? '—' },
  ];

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error) return <Card className="border border-error-200 bg-error-50 text-error-700"><p className="text-sm">{error}</p></Card>;

  return (
    <div className="space-y-5">
      <Card>
        <p className="mb-2 text-sm font-semibold text-ink-900">Applications</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Add a college application" className="flex-1">
            <Input value={collegeId} onChange={(e) => setCollegeId(e.target.value)} placeholder="college id (from College Hub)" />
          </Field>
          <Button icon="plus" loading={adding} onClick={() => void add()}>Add</Button>
        </div>

        {apps.length > 0 && (
          <ul className="mt-3 divide-y divide-surface-border">
            {apps.map((app) => (
              <li key={app.applicationId} className="flex items-center justify-between gap-2 py-2">
                <span className="truncate text-sm text-ink-800">{app.collegeId}</span>
                <div className="flex items-center gap-1">
                  <Select value={app.decision ?? 'none'} onChange={(e) => void setDecision(app, e.target.value as ApplicationDecision)} className="max-w-[10rem]">
                    {APPLICATION_DECISIONS.map((d) => <option key={d} value={d}>{DECISION_META[d].label}</option>)}
                  </Select>
                  <Button size="sm" variant="ghost" icon="close" aria-label="Remove application" onClick={() => void remove(app)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink-900">Compare offers</p>
        {matrix.length === 0 ? (
          <EmptyState
            icon="school"
            title="No decisions yet"
            description="Once you mark an application accepted, waitlisted, or deferred, your offers line up here by net cost and fit."
          />
        ) : (
          <Table columns={columns} rows={matrix} rowKey={(r) => r.collegeId} />
        )}
      </div>
    </div>
  );
}
