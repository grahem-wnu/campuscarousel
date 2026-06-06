import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../shared/shell';
import { Button, DateField, Field, Select, Textarea, TextField, useToast } from '../../shared/ui';
import { createEntry, listLinkableActivities, listLinkableClinical, updateEntry } from './api';
import { CATEGORY_META, canSetPrivate, withCurrentLink } from './logic';
import {
  CATEGORIES,
  type Category,
  type LinkOption,
  type Visibility,
  type WhyNursingEntry,
  type WhyNursingInput,
} from './types';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface EntryFormProps {
  /** When provided, the form edits this entry; otherwise it creates a new one. */
  entry?: WhyNursingEntry;
  onSaved?: (entry: WhyNursingEntry) => void;
  onCancel?: () => void;
}

/** Add/edit form for a "Why Nursing" entry. The Private toggle is offered only to Keira (student
 *  role); the server enforces the same rule, so this is a UX nicety, not the security boundary. */
export function EntryForm({ entry, onSaved, onCancel }: EntryFormProps) {
  const { user } = useAuth();
  const toast = useToast();
  const allowPrivate = canSetPrivate(user?.role);
  const editing = Boolean(entry);

  const [date, setDate] = useState(entry?.date ?? todayIso());
  const [title, setTitle] = useState(entry?.title ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [category, setCategory] = useState<Category | ''>(entry?.category ?? '');
  const [tagsText, setTagsText] = useState((entry?.tags ?? []).join(', '));
  const [visibility, setVisibility] = useState<Visibility>(entry?.visibility ?? 'family');
  const [linkedActivityId, setLinkedActivityId] = useState(entry?.linkedActivityId ?? '');
  const [linkedClinicalId, setLinkedClinicalId] = useState(entry?.linkedClinicalId ?? '');
  const [activityOptions, setActivityOptions] = useState<LinkOption[]>([]);
  const [clinicalOptions, setClinicalOptions] = useState<LinkOption[]>([]);
  const [saving, setSaving] = useState(false);

  // Populate the link pickers from the journal + clinical-hours list endpoints. Best-effort: if a
  // list call fails the picker still works (the current link, if any, stays selectable).
  useEffect(() => {
    let alive = true;
    void listLinkableActivities()
      .then((o) => alive && setActivityOptions(o))
      .catch(() => undefined);
    void listLinkableClinical()
      .then((o) => alive && setClinicalOptions(o))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Give the entry an evocative title.');
      return;
    }
    if (!content.trim()) {
      toast.error('Write the moment down — that’s the whole point.');
      return;
    }
    setSaving(true);
    try {
      const input: WhyNursingInput = {
        date,
        title: title.trim(),
        content: content.trim(),
        // Note: a category can be set or changed, but an omitted (`undefined`) value is preserved
        // by the data layer's optional-merge on update — so once set it can't be cleared back to
        // uncategorized through the API contract (`category` is an optional enum, no null sentinel).
        category: category || undefined,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        linkedActivityId: linkedActivityId || undefined,
        linkedClinicalId: linkedClinicalId || undefined,
        visibility: allowPrivate ? visibility : 'family',
      };
      const saved = entry ? await updateEntry(entry.entryId, input) : await createEntry(input);
      toast.success(editing ? 'Updated.' : 'Captured. This is great essay material.');
      onSaved?.(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateField label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Field label="Category" hint="Optional — how this shaped your why.">
          <Select value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
            <option value="">Uncategorized</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <TextField
        label="Title"
        required
        placeholder="e.g. The night shift that changed everything"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <Field label="What happened" hint="Tell it fully — there’s no length limit. This is the raw material for your essays.">
        <Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>

      <TextField
        label="Tags"
        hint="Comma-separated, for later AI context (e.g. compassion, resilience)."
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Link to a journal entry" hint="Optional — connect this to an activity.">
          <Select value={linkedActivityId} onChange={(e) => setLinkedActivityId(e.target.value)}>
            <option value="">— none —</option>
            {withCurrentLink(activityOptions, linkedActivityId).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Link to a clinical entry" hint="Optional — connect this to a clinical-hours entry.">
          <Select value={linkedClinicalId} onChange={(e) => setLinkedClinicalId(e.target.value)}>
            <option value="">— none —</option>
            {withCurrentLink(clinicalOptions, linkedClinicalId).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {allowPrivate ? (
        <Field label="Visibility" hint="Private entries are visible only to you — never to family.">
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            <option value="family">Family — visible to your family</option>
            <option value="private">Private — only you</option>
          </Select>
        </Field>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={saving} icon={editing ? 'check' : 'plus'}>
          {editing ? 'Save changes' : 'Capture this'}
        </Button>
      </div>
    </form>
  );
}
