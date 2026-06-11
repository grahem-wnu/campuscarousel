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
  useToast,
} from '../../shared/ui';
import { DateField } from '../../shared/ui';
import { deleteEntry, listEntries } from './api';
import { EntryForm } from './EntryForm';
import { TimelineView } from './TimelineView';
import { CATEGORY_META, canSetPrivate, filterBySearch } from './logic';
import { CATEGORIES, type Category, type MotivationEntry } from './types';

/** Motivation living document — a chronological stream of the moments that crystallize Keira's
 *  why. Timeline with per-category styling, add/edit, and an inviting empty state. */
export default function MotivationPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = canSetPrivate(user?.role); // only Keira authors/edits her own "why"

  const [entries, setEntries] = useState<MotivationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<Category | ''>('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<MotivationEntry | null>(null);
  const [deleting, setDeleting] = useState<MotivationEntry | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listEntries({
        category: category || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setEntries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your motivation entries.');
    } finally {
      setLoading(false);
    }
  }, [category, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => filterBySearch(entries, search), [entries, search]);
  const hasFilters = Boolean(category || search || from || to);

  function clearFilters(): void {
    setCategory('');
    setSearch('');
    setFrom('');
    setTo('');
  }

  async function confirmDelete(): Promise<void> {
    if (!deleting) return;
    setRemoving(true);
    try {
      await deleteEntry(deleting.entryId);
      toast.success('Entry deleted.');
      setDeleting(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the entry.');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Why This Path</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            The moments, conversations, and realizations behind your why — the raw material for
            authentic essays.
          </p>
        </div>
        {canEdit ? (
          <Button icon="plus" onClick={() => setShowAdd(true)}>
            Add entry
          </Button>
        ) : null}
      </header>

      <Card flush className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search" className="min-w-[12rem] flex-1">
            <Input
              placeholder="Search title, story, tags…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
              <option value="">All</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_META[c].label}
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
      ) : entries.length === 0 ? (
        <EmptyState
          icon="heart"
          title={hasFilters ? 'No entries match your filters' : 'Start your “why”'}
          description={
            hasFilters
              ? 'Try clearing the filters to see everything.'
              : "Capture the first moment that revealed what's driving you toward your goals — a person, a conversation, a feeling. Each one becomes the heart of a future essay."
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : canEdit ? (
              <Button icon="plus" onClick={() => setShowAdd(true)}>
                Capture your first moment
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">No entries match your search.</p>
      ) : (
        <TimelineView
          entries={visible}
          canEdit={canEdit}
          onEdit={(e) => setEditing(e)}
          onDelete={(e) => setDeleting(e)}
        />
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Capture a moment">
        <EntryForm
          onSaved={() => {
            setShowAdd(false);
            void load();
          }}
          onCancel={() => setShowAdd(false)}
        />
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit entry">
        {editing ? (
          <EntryForm
            entry={editing}
            onSaved={() => {
              setEditing(null);
              void load();
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete this entry?">
        <p className="text-sm text-ink-700">
          “{deleting?.title}” will be permanently removed. This can’t be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)} disabled={removing}>
            Cancel
          </Button>
          <Button variant="outline" loading={removing} onClick={() => void confirmDelete()}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
