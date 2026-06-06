import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  DateField,
  EmptyState,
  Field,
  Modal,
  Select,
  Spinner,
  Textarea,
  TextField,
  useToast,
} from '../../shared/ui';
import { createTouchpoint, deleteTouchpoint, listTouchpoints, updateTouchpoint } from './api';
import { sortByDateDesc, touchpointLabel } from './logic';
import { TOUCHPOINT_TYPES, type Touchpoint, type TouchpointInput, type TouchpointType } from './types';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function TouchpointForm({
  collegeId,
  existing,
  onSaved,
  onCancel,
}: {
  collegeId: string;
  existing?: Touchpoint;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [type, setType] = useState<TouchpointType>(existing?.type ?? 'info-session');
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const [description, setDescription] = useState(existing?.description ?? '');
  const [contactPerson, setContactPerson] = useState(existing?.contactPerson ?? '');
  const [followUpNeeded, setFollowUpNeeded] = useState(Boolean(existing?.followUpNeeded));
  const [followUpDate, setFollowUpDate] = useState(existing?.followUpDate ?? '');
  const [followUpCompleted, setFollowUpCompleted] = useState(Boolean(existing?.followUpCompleted));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    try {
      const input: TouchpointInput = {
        type,
        date,
        description: description.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined,
        followUpNeeded,
        followUpDate: followUpNeeded && followUpDate ? followUpDate : undefined,
        followUpCompleted,
        notes: notes.trim() || undefined,
      };
      if (existing) await updateTouchpoint(collegeId, existing.touchpointId, input);
      else await createTouchpoint(collegeId, input);
      toast.success(existing ? 'Updated.' : 'Logged.');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the touchpoint.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as TouchpointType)}>
            {TOUCHPOINT_TYPES.map((t) => (
              <option key={t} value={t}>
                {touchpointLabel(t)}
              </option>
            ))}
          </Select>
        </Field>
        <DateField label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <Field label="What happened">
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <TextField label="Contact person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" checked={followUpNeeded} onChange={(e) => setFollowUpNeeded(e.target.checked)} />
        Follow-up needed
      </label>
      {followUpNeeded ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField label="Follow-up by" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700">
            <input type="checkbox" checked={followUpCompleted} onChange={(e) => setFollowUpCompleted(e.target.checked)} />
            Completed
          </label>
        </div>
      ) : null}
      <Field label="Notes">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving} icon={existing ? 'check' : 'plus'}>
          {existing ? 'Save' : 'Log touchpoint'}
        </Button>
      </div>
    </form>
  );
}

/** Per-college demonstrated-interest log. Exported so college-hub can mount it in its detail tab;
 *  also used by the standalone page's Touchpoints tab. */
export function TouchpointsPanel({ collegeId }: { collegeId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<Touchpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Touchpoint | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listTouchpoints(collegeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load touchpoints.');
    } finally {
      setLoading(false);
    }
  }, [collegeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(t: Touchpoint): Promise<void> {
    try {
      await deleteTouchpoint(collegeId, t.touchpointId);
      toast.success('Deleted.');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <p className="text-sm text-ink-500">{items.length} touchpoint{items.length === 1 ? '' : 's'}</p>
        <Button size="sm" icon="plus" onClick={() => setAdding(true)}>
          Log touchpoint
        </Button>
      </div>

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon="contacts" title="No touchpoints yet" description="Log info sessions, visits, emails, and calls to show demonstrated interest." />
      ) : (
        <div className="space-y-2">
          {sortByDateDesc(items).map((t) => (
            <Card key={t.touchpointId}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="primary">{touchpointLabel(t.type)}</Badge>
                    <span className="text-sm text-ink-500">{t.date}</span>
                    {t.followUpNeeded && !t.followUpCompleted ? <Badge tone="warn">Follow-up{t.followUpDate ? ` by ${t.followUpDate}` : ''}</Badge> : null}
                  </div>
                  {t.description ? <p className="mt-1 text-sm text-ink-700">{t.description}</p> : null}
                  {t.contactPerson ? <p className="mt-1 text-xs text-ink-500">With {t.contactPerson}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(t)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Log a touchpoint">
        <TouchpointForm collegeId={collegeId} onSaved={() => { setAdding(false); void load(); }} onCancel={() => setAdding(false)} />
      </Modal>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit touchpoint">
        {editing ? (
          <TouchpointForm collegeId={collegeId} existing={editing} onSaved={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} />
        ) : null}
      </Modal>
    </div>
  );
}
