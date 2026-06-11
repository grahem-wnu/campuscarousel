import { useState } from 'react';
import { Badge, Button, Card, Field, Input, Select, Spinner } from '../../shared/ui';
import { bulkAddScholarships, discoverScholarships } from './api';
import { TYPE_META, formatAmount } from './logic';
import { TYPES, type DiscoveredScholarship, type ScholarshipInput, type ScholarshipType } from './types';

interface Props {
  onSaved: (count: number) => void;
  onCancel: () => void;
}

interface Draft extends DiscoveredScholarship {
  include: boolean;
}

/** Discover flow: gather search context → AI web search → selectable results → bulk-add the chosen
 *  set. Nothing is saved until "Save selected". Degrades gracefully when discovery is unavailable. */
export function DiscoverScholarships({ onSaved, onCancel }: Props) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ScholarshipType | ''>('');
  const [state, setState] = useState('');
  const [phase, setPhase] = useState<'form' | 'loading' | 'review'>('form');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setPhase('loading');
    setError(null);
    try {
      const results = await discoverScholarships({
        query: query.trim() || undefined,
        type: type || undefined,
        state: state.trim() || undefined,
      });
      setDrafts(results.map((r) => ({ ...r, include: true })));
      setPhase('review');
      if (results.length === 0) setError('No scholarships found. Try different terms, or add one manually.');
    } catch (err) {
      setPhase('form');
      setError(err instanceof Error ? err.message : 'Discovery is unavailable right now.');
    }
  }

  async function save() {
    const chosen = drafts.filter((d) => d.include && d.name.trim());
    if (chosen.length === 0) {
      setError('Check at least one scholarship to save.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: ScholarshipInput[] = chosen.map((d) => ({
        name: d.name.trim(),
        provider: d.provider,
        amount: d.amount,
        amountDescription: d.amountDescription,
        type: d.type,
        eligibility: d.eligibility,
        applicationDeadline: d.applicationDeadline,
        applicationUrl: d.applicationUrl,
      }));
      // hydrate=true is best-effort server-side; records are saved regardless.
      await bulkAddScholarships(payload, true);
      onSaved(chosen.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the selected scholarships.');
      setSaving(false);
    }
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-ink-500">
        <Spinner />
        Searching the web for scholarships…
      </div>
    );
  }

  if (phase === 'review') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-600">
          Uncheck any you don&apos;t want. Saved scholarships are refreshed with full details automatically.
        </p>
        {error ? <p className="text-sm text-error-700">{error}</p> : null}
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {drafts.map((d, i) => (
            <Card key={i} flush className="flex gap-3 p-3">
              <input
                type="checkbox"
                checked={d.include}
                onChange={(e) => setDrafts((p) => p.map((x, idx) => (idx === i ? { ...x, include: e.target.checked } : x)))}
                className="mt-1 h-4 w-4 rounded border-ink-300 text-primary-600"
                aria-label={`Include ${d.name}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-ink-900">{d.name}</span>
                  <span className="shrink-0 text-sm text-ink-700">{formatAmount(d.amount, d.amountDescription)}</span>
                </div>
                {d.provider ? <p className="text-xs text-ink-500">{d.provider}</p> : null}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {d.type ? <Badge tone="neutral">{TYPE_META[d.type]}</Badge> : null}
                  {d.applicationDeadline ? <Badge tone="warn">Due {d.applicationDeadline}</Badge> : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => setPhase('form')} disabled={saving}>
            Back
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Save selected
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={run} className="space-y-4">
      <p className="text-sm text-ink-600">
        Search for major-specific, merit, community-service, state, and college-specific scholarships.
      </p>
      <Field label="What to look for" hint="Keywords, focus, or eligibility">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="scholarships for high school seniors in your major" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as ScholarshipType | '')}>
            <option value="">Any</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="State" hint="For state-specific awards">
          <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="Ohio" />
        </Field>
      </div>
      {error ? <p className="text-sm text-error-700">{error}</p> : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" icon="search">
          Discover
        </Button>
      </div>
    </form>
  );
}
