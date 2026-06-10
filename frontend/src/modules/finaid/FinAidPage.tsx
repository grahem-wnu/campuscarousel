import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Field, Input, Select, Spinner, useToast } from '../../shared/ui';
import { createFinAid, deleteFinAid, listFinAid, seedFinAid, updateFinAid } from './api';
import { KINDS, STATUSES, countdownLabel, kindLabel, statusLabel } from './logic';
import type { FinAidItem, FinAidKind, FinAidStatus } from './types';

const today = () => new Date().toISOString().slice(0, 10);

export default function FinAidPage() {
  const toast = useToast();
  const [items, setItems] = useState<FinAidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [classYear, setClassYear] = useState('');
  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState<FinAidKind>('institutional-aid');
  const [newTitle, setNewTitle] = useState('');
  const [newDeadline, setNewDeadline] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listFinAid();
      list.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load financial aid.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function seed() {
    const year = Number(classYear);
    if (!year || year < 2000) {
      toast.error('Enter the graduation year (e.g. 2029).');
      return;
    }
    try {
      const res = await seedFinAid(year);
      toast.success(res.added > 0 ? `Added ${res.added} standard form${res.added === 1 ? '' : 's'}.` : 'Already set up.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not seed forms.');
    }
  }

  async function addItem() {
    if (!newTitle.trim()) {
      toast.error('Give the item a title.');
      return;
    }
    try {
      await createFinAid({ kind: newKind, title: newTitle.trim(), deadline: newDeadline || undefined });
      setNewTitle('');
      setNewDeadline('');
      setAdding(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add item.');
    }
  }

  async function setStatus(item: FinAidItem, status: FinAidStatus) {
    setItems((prev) => prev.map((x) => (x.itemId === item.itemId ? { ...x, status } : x)));
    try {
      await updateFinAid(item.itemId, { status });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update.');
      await load();
    }
  }

  async function remove(item: FinAidItem) {
    if (!window.confirm(`Remove "${item.title}"?`)) return;
    try {
      await deleteFinAid(item.itemId);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove.');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-ink-900">Financial Aid</h1>
        <p className="text-sm text-ink-600">
          Track FAFSA, the CSS Profile, and each school&rsquo;s aid deadlines so no money is left on the
          table.
        </p>
      </header>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-800">Quick start</h2>
        <p className="text-sm text-ink-600">Add the standard federal forms for the graduating class:</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Field label="Graduation year">
              <Input type="number" value={classYear} onChange={(e) => setClassYear(e.target.value)} placeholder="2029" />
            </Field>
          </div>
          <Button variant="outline" onClick={() => void seed()}>
            Seed FAFSA &amp; CSS
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-800">Items</h2>
        <Button size="sm" icon="plus" variant="outline" onClick={() => setAdding((v) => !v)}>
          Add item
        </Button>
      </div>

      {adding ? (
        <Card className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Kind">
              <Select value={newKind} onChange={(e) => setNewKind(e.target.value as FinAidKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kindLabel(k)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" className="sm:col-span-2">
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="UCI institutional aid form" />
            </Field>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="w-44">
              <Field label="Deadline">
                <Input type="date" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
              </Field>
            </div>
            <Button onClick={() => void addItem()}>Save</Button>
          </div>
        </Card>
      ) : null}

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
          icon="scholarship"
          title="No aid items yet"
          description="Seed the standard FAFSA/CSS forms above, or add a school's aid form."
        />
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <Card key={i.itemId} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{i.title}</p>
                <p className="text-xs text-ink-500">
                  {kindLabel(i.kind)}
                  {i.deadline ? ` · due ${i.deadline} (${countdownLabel(i.deadline, today())})` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={i.status}
                  onChange={(e) => void setStatus(i, e.target.value as FinAidStatus)}
                  className="h-8 text-xs"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="ghost" onClick={() => void remove(i)}>
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
