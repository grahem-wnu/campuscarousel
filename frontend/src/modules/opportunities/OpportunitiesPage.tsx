import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Field, Input, Select, Spinner, useToast } from '../../shared/ui';
import { bulkAdd, deleteOpportunity, listOpportunities, pollDiscovery, startDiscovery, updateOpportunity } from './api';
import { STATUSES, TYPES, statusLabel, typeLabel } from './logic';
import type { Opportunity, OpportunityCandidate, OpportunityStatus, OpportunityType } from './types';

const POLL_MS = 3000;
const MAX_POLLS = 60; // ~3 min — web-grounded discovery runs on the 300s worker but can exceed 60s

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function OpportunitiesPage() {
  const toast = useToast();

  // Discovery panel state.
  const [discType, setDiscType] = useState<OpportunityType | ''>('');
  const [location, setLocation] = useState('');
  const [query, setQuery] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [candidates, setCandidates] = useState<OpportunityCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Tracked list state.
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listOpportunities());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load opportunities.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function discover() {
    setDiscovering(true);
    setCandidates([]);
    setSelected(new Set());
    try {
      let job = await startDiscovery({
        type: discType || undefined,
        location: location || undefined,
        query: query || undefined,
      });
      for (let tries = 0; job.status === 'pending' && tries < MAX_POLLS; tries++) {
        await sleep(POLL_MS);
        job = await pollDiscovery(job.jobId);
      }
      if (job.status === 'failed') {
        toast.error(job.error || 'Discovery failed. Try again.');
        return;
      }
      // Still pending after the poll window — the worker is slow, NOT a "0 results" outcome. Don't
      // claim "Found 0"; tell the user it's still running so they can re-check rather than retry blind.
      if (job.status === 'pending') {
        toast.error('Discovery is taking longer than expected — please try again in a moment.');
        return;
      }
      setCandidates(job.candidates ?? []);
      toast.success(`Found ${job.candidates?.length ?? 0} opportunit${(job.candidates?.length ?? 0) === 1 ? 'y' : 'ies'}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Discovery failed.');
    } finally {
      setDiscovering(false);
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function addSelected() {
    const chosen = candidates.filter((_, i) => selected.has(i));
    if (chosen.length === 0) {
      toast.error('Select at least one to add.');
      return;
    }
    try {
      await bulkAdd(chosen);
      toast.success(`Added ${chosen.length}.`);
      setCandidates([]);
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add.');
    }
  }

  async function setStatus(o: Opportunity, status: OpportunityStatus) {
    setItems((prev) => prev.map((x) => (x.opportunityId === o.opportunityId ? { ...x, status } : x)));
    try {
      await updateOpportunity(o.opportunityId, { status });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update.');
      await load();
    }
  }

  async function remove(o: Opportunity) {
    if (!window.confirm(`Remove "${o.name}"?`)) return;
    try {
      await deleteOpportunity(o.opportunityId);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove.');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-ink-900">Opportunities</h1>
        <p className="text-sm text-ink-600">
          Find ways to build hands-on experience for your path — internships, volunteering, job
          shadowing, training programs, and summer programs near you.
        </p>
      </header>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-800">Discover opportunities</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select value={discType} onChange={(e) => setDiscType(e.target.value as OpportunityType | '')}>
              <option value="">Any type</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Near (city, state)">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Aliso Viejo, CA" />
          </Field>
        </div>
        <Field label="Keywords (optional)">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="paid, remote, beginner-friendly…" />
        </Field>
        <div className="flex justify-end">
          <Button icon="search" loading={discovering} onClick={() => void discover()}>
            Discover
          </Button>
        </div>

        {discovering ? (
          <p className="text-xs text-ink-500">Searching the web for current programs… this can take a minute.</p>
        ) : null}

        {candidates.length > 0 ? (
          <div className="space-y-2 border-t border-surface-border pt-3">
            <p className="text-xs font-medium text-ink-700">Select the ones to track:</p>
            {candidates.map((c, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-2 rounded-md bg-surface-sunken p-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggle(i)}
                  className="mt-1 h-4 w-4 rounded border-surface-border text-primary-600"
                />
                <span className="min-w-0">
                  <span className="font-medium text-ink-900">{c.name}</span>
                  {c.organization ? <span className="text-ink-500"> · {c.organization}</span> : null}
                  {c.type ? <span className="text-ink-500"> · {typeLabel(c.type)}</span> : null}
                  {c.description ? <span className="block text-xs text-ink-500">{c.description}</span> : null}
                  {c.distanceNote ? <span className="block text-xs text-ink-400">{c.distanceNote}</span> : null}
                </span>
              </label>
            ))}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => void addSelected()}>
                Add selected ({selected.size})
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <h2 className="text-sm font-semibold text-ink-800">Tracked opportunities</h2>
      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nothing tracked yet"
          description="Use Discover above to find internships, volunteering, shadowing, and programs for your path near you."
        />
      ) : (
        <div className="space-y-2">
          {items.map((o) => (
            <Card key={o.opportunityId} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{o.name}</p>
                <p className="text-xs text-ink-500">
                  {typeLabel(o.type)}
                  {o.organization ? ` · ${o.organization}` : ''}
                  {o.location ? ` · ${o.location}` : ''}
                </p>
                {o.applicationUrl ? (
                  <a href={o.applicationUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline">
                    Application link
                  </a>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={o.status}
                  onChange={(e) => void setStatus(o, e.target.value as OpportunityStatus)}
                  className="h-8 text-xs"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="ghost" onClick={() => void remove(o)}>
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
