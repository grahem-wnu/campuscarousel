import { useState } from 'react';
import { Badge, Button, Icon, Select, safeHref } from '../../shared/ui';
import { deleteScholarship, hydrateScholarship, updateScholarship } from './api';
import { STATUS_META, TYPE_META, deadlineInfo, formatAmount } from './logic';
import { STATUSES, type Scholarship, type Status } from './types';

interface Props {
  scholarship: Scholarship;
  today: string;
  onUpdated: (s: Scholarship) => void;
  onDeleted: (id: string) => void;
  onEdit: (s: Scholarship) => void;
}

/** Scholarship detail: structured data, application checklist (required materials), status control,
 *  Refresh (AI hydrate), notes, link, linked colleges, edit/delete. */
export function ScholarshipDetail({ scholarship: s, today, onUpdated, onDeleted, onEdit }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dl = deadlineInfo(s.applicationDeadline, today);

  async function persist(patch: Parameters<typeof updateScholarship>[1]) {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await updateScholarship(s.scholarshipId, patch));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const refreshed = await hydrateScholarship(s.scholarshipId);
      onUpdated(refreshed);
      setInfo(refreshed.hydrationStatus === 'failed' ? 'Could not refresh details — try again later.' : 'Refreshed with the latest details.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request a refresh.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteScholarship(s.scholarshipId);
      onDeleted(s.scholarshipId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {s.status ? <Badge tone={STATUS_META[s.status].tone}>{STATUS_META[s.status].label}</Badge> : null}
        {s.type ? <Badge tone="neutral">{TYPE_META[s.type]}</Badge> : null}
        <Badge tone={dl.tone}>
          <Icon name="calendar" size={11} />
          <span className="ml-1">{dl.label}</span>
        </Badge>
        {s.hydrationStatus === 'pending' ? <Badge tone="info">Refreshing…</Badge> : null}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-2xl font-bold text-ink-900">{formatAmount(s.amount, s.amountDescription)}</div>
          {s.provider ? <div className="text-sm text-ink-500">{s.provider}</div> : null}
        </div>
        {s.isRenewable ? <Badge tone="success">Renewable</Badge> : null}
      </div>

      {s.eligibility?.length ? (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-ink-800">Eligibility</h4>
          <ul className="list-inside list-disc text-sm text-ink-700">
            {s.eligibility.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {s.requiredMaterials?.length ? (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-ink-800">Application checklist</h4>
          <ul className="space-y-1 text-sm text-ink-700">
            {s.requiredMaterials.map((m, i) => (
              <li key={i} className="flex items-center gap-2">
                <Icon name="check" size={13} />
                {m}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {s.linkedColleges?.length ? (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-ink-800">Linked colleges</h4>
          <div className="flex flex-wrap gap-1.5">
            {s.linkedColleges.map((c) => (
              <Badge key={c} tone="neutral">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {s.notes ? <p className="whitespace-pre-wrap text-sm text-ink-700">{s.notes}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-600">Status</label>
          <Select value={s.status ?? 'discovered'} disabled={busy} onChange={(e) => void persist({ status: e.target.value as Status })}>
            {STATUSES.map((sv) => (
              <option key={sv} value={sv}>
                {STATUS_META[sv].label}
              </option>
            ))}
          </Select>
        </div>
        {safeHref(s.applicationUrl) ? (
          <div className="flex items-end">
            <a href={safeHref(s.applicationUrl)} target="_blank" rel="noopener noreferrer" className="w-full">
              <Button variant="outline" icon="application" block>
                Open application
              </Button>
            </a>
          </div>
        ) : null}
      </div>

      {info ? <p className="text-sm text-success-700">{info}</p> : null}
      {error ? <p className="text-sm text-error-700">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 pt-4">
        <div className="flex gap-2">
          <Button variant="outline" icon="search" onClick={() => void refresh()} disabled={busy}>
            Refresh data
          </Button>
          <Button variant="ghost" icon="scholarship" onClick={() => onEdit(s)} disabled={busy}>
            Edit
          </Button>
        </div>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-600">Delete?</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={busy} onClick={() => void remove()}>
              Delete
            </Button>
          </div>
        ) : (
          <Button variant="ghost" icon="close" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
