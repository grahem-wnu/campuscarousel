import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, Spinner } from '../../shared/ui';
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
import { expiringWithin, sortForDisplay } from './logic';
import type { Certification, CertificationInput, CertSuggestion } from './types';

/** Certifications tracker — expandable cards with status + expiration countdown, expiring-soon
 *  alerts, training progress, AI-suggested certs, and "how & where to get it" guidance. */
export default function CertificationsPage() {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Which card is expanded (one at a time). The expiring widget can open a specific card.
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const ordered = useMemo(() => sortForDisplay(certs), [certs]);
  const expiring = useMemo(() => expiringWithin(certs), [certs]);

  async function submitAdd(input: CertificationInput): Promise<void> {
    setAddBusy(true);
    setAddError(null);
    try {
      await createCertification(input);
      setAdding(false);
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not save. Check the fields and try again.');
    } finally {
      setAddBusy(false);
    }
  }

  // Card-driven edit/delete: reject on failure so the card surfaces the error inline and stays open.
  async function saveCert(certId: string, input: CertificationInput): Promise<void> {
    await updateCertification(certId, input);
    await load();
  }
  async function deleteCert(certId: string): Promise<void> {
    await deleteCertification(certId);
    await load();
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
          <Button
            icon={adding ? 'close' : 'plus'}
            variant={adding ? 'ghost' : 'primary'}
            onClick={() => {
              setAdding((v) => !v);
              setAddError(null);
            }}
          >
            {adding ? 'Cancel' : 'Add certification'}
          </Button>
        </div>
      </header>

      <ExpiringWidget expiring={expiring} onSelect={(cert) => setExpandedId(cert.certId)} />

      {adding ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink-700">Add a certification</h2>
          <CertForm
            busy={addBusy}
            error={addError}
            onSubmit={(input) => void submitAdd(input)}
            onCancel={() => {
              setAdding(false);
              setAddError(null);
            }}
          />
        </Card>
      ) : null}

      {showSuggest ? (
        <SuggestionsPanel
          suggestions={suggestions}
          loading={suggestLoading}
          careerGoal={careerGoal}
          onAdd={(s) => void addSuggestion(s)}
          onDismiss={() => setShowSuggest(false)}
        />
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
          description="Add the certifications you've earned or plan to earn — anything that builds skills or strengthens an application — to track renewals and training. The suggestions above are tailored to your path and are a good place to start."
          action={
            <Button icon="plus" onClick={() => setAdding(true)}>
              Add your first certification
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ordered.map((cert) => (
            <CertificationCard
              key={cert.certId}
              cert={cert}
              expanded={expandedId === cert.certId}
              onToggle={() => setExpandedId((id) => (id === cert.certId ? null : cert.certId))}
              onSave={saveCert}
              onDelete={deleteCert}
            />
          ))}
        </div>
      )}
    </div>
  );
}
