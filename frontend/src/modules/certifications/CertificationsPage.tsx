import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, Field, Modal, Select, Spinner } from '../../shared/ui';
import { CertificationCard } from './CertificationCard';
import { CertForm } from './CertForm';
import { ExpiringWidget } from './ExpiringWidget';
import { SuggestionsPanel } from './SuggestionsPanel';
import {
  createCertification,
  deleteCertification,
  listCertifications,
  suggestCertifications,
  updateCertification,
} from './api';
import { STATUS_META, STATUS_OPTIONS, expiringWithin, sortForDisplay } from './logic';
import type { Certification, CertificationInput, CertStatus, CertSuggestion } from './types';

/** Certifications tracker — cards with status + expiration countdown, expiring-soon alerts,
 *  training progress, AI-suggested certs, and a renew flow. */
export default function CertificationsPage() {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CertStatus | ''>('');

  const [editing, setEditing] = useState<Certification | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<CertSuggestion[]>([]);
  const [careerGoal, setCareerGoal] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listCertifications();
      setCerts(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your certifications.');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    setShowSuggest(true);
    setSuggestLoading(true);
    try {
      const res = await suggestCertifications();
      setSuggestions(res.suggestions);
      setCareerGoal(res.careerGoal);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, []);

  // First load; auto-surface suggestions when there's nothing tracked yet (first visit).
  useEffect(() => {
    void (async () => {
      const list = await load();
      if (list.length === 0) void fetchSuggestions();
    })();
  }, [load, fetchSuggestions]);

  const filtered = useMemo(() => {
    const visible = statusFilter ? certs.filter((c) => c.effectiveStatus === statusFilter) : certs;
    return sortForDisplay(visible);
  }, [certs, statusFilter]);

  const expiring = useMemo(() => expiringWithin(certs), [certs]);

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(cert: Certification): void {
    setEditing(cert);
    setFormError(null);
    setShowForm(true);
  }

  async function submitForm(input: CertificationInput): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) await updateCertification(editing.certId, input);
      else await createCertification(input);
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save. Check the fields and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function removeCert(): Promise<void> {
    if (!editing) return;
    setSubmitting(true);
    try {
      await deleteCertification(editing.certId);
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not delete this certification.');
    } finally {
      setSubmitting(false);
    }
  }

  async function addSuggestion(s: CertSuggestion): Promise<void> {
    try {
      await createCertification({
        name: s.name,
        issuingOrganization: s.issuingOrganization,
        renewalFrequency: s.renewalFrequency,
        renewalRequired: Boolean(s.renewalFrequency),
        cost: s.typicalCost,
        status: 'planned',
      });
      setSuggestions((prev) => prev.filter((x) => x.name !== s.name));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that certification.');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Certifications</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Track certifications, renewal dates, and training toward your goals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon="star" onClick={() => void fetchSuggestions()}>
            Suggest certs
          </Button>
          <Button icon="plus" onClick={openCreate}>
            Add certification
          </Button>
        </div>
      </header>

      <ExpiringWidget expiring={expiring} onSelect={openEdit} />

      {showSuggest ? (
        <SuggestionsPanel
          suggestions={suggestions}
          loading={suggestLoading}
          careerGoal={careerGoal}
          onAdd={(s) => void addSuggestion(s)}
          onDismiss={() => setShowSuggest(false)}
        />
      ) : null}

      {certs.length > 0 ? (
        <div className="flex items-end gap-3">
          <Field label="Filter by status">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as CertStatus | '')}
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

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
      ) : certs.length === 0 ? (
        <EmptyState
          icon="certificate"
          title="No certifications yet"
          description="Add the certifications you've earned or plan to — BLS/CPR, CNA, First Aid — to track renewals and training. The suggestions above are a good place to start."
          action={
            <Button icon="plus" onClick={openCreate}>
              Add your first certification
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">No certifications match this filter.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map((cert) => (
            <CertificationCard key={cert.certId} cert={cert} onEdit={openEdit} onRenew={openEdit} />
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Edit certification' : 'Add a certification'}
        size="lg"
      >
        <CertForm
          initial={editing ?? undefined}
          busy={submitting}
          error={formError}
          onSubmit={(input) => void submitForm(input)}
          onCancel={() => setShowForm(false)}
          onDelete={editing ? () => void removeCert() : undefined}
        />
      </Modal>
    </div>
  );
}
