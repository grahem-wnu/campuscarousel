import { useState, type FormEvent } from 'react';
import { useAuth } from '../../shared/shell';
import { Button, DateField, Field, Select, Textarea, TextField, useToast } from '../../shared/ui';
import { createActivity } from './api';
import { CATEGORY_META, canSetPrivate } from './logic';
import { CATEGORIES, type Activity, type ActivityInput, type Category, type Visibility } from './types';

/** Notify any mounted JournalPage that an entry was created (used by the app-wide FAB slot). */
export const ACTIVITY_CREATED_EVENT = 'activity-journal:created';
function announceCreated(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ACTIVITY_CREATED_EVENT));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface QuickAddFormProps {
  onCreated?: (activity: Activity) => void;
  onCancel?: () => void;
  defaultCategory?: Category;
}

/** The < 30s quick-add form. The Private toggle is offered only to Keira (student role); the
 *  server enforces the same rule, so this is a UX nicety, not the security boundary. */
export function QuickAddForm({ onCreated, onCancel, defaultCategory = 'volunteer' }: QuickAddFormProps) {
  const { user } = useAuth();
  const toast = useToast();
  const allowPrivate = canSetPrivate(user?.role);

  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [subcategory, setSubcategory] = useState('');
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('family');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Give the entry a short title.');
      return;
    }
    const hoursNum = hours.trim() ? Number(hours) : undefined;
    if (hoursNum !== undefined && (Number.isNaN(hoursNum) || hoursNum < 0)) {
      toast.error('Hours must be a non-negative number.');
      return;
    }
    setSaving(true);
    try {
      const input: ActivityInput = {
        date,
        category,
        title: title.trim(),
        subcategory: subcategory.trim() || undefined,
        description: description.trim() || undefined,
        hours: hoursNum,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        visibility: allowPrivate ? visibility : 'family',
      };
      const created = await createActivity(input);
      toast.success('Logged. Nice work!');
      announceCreated();
      onCreated?.(created);
      // Reset for a quick second entry.
      setTitle('');
      setSubcategory('');
      setHours('');
      setDescription('');
      setTagsText('');
      setVisibility('family');
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
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
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
        placeholder="e.g. Volunteered at CHOC pediatric unit"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Subcategory"
          placeholder="e.g. hospital-volunteer"
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
        />
        <TextField
          label="Hours"
          type="number"
          min={0}
          step="0.25"
          placeholder="optional"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </div>

      <Field label="Description" hint="Optional — what happened, what you did.">
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <TextField
        label="Tags"
        hint="Comma-separated, for later AI context (e.g. leadership, patient-care)."
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
      />

      {allowPrivate ? (
        <Field label="Visibility" hint="Private entries are visible only to you.">
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
        <Button type="submit" loading={saving} icon="plus">
          Log activity
        </Button>
      </div>
    </form>
  );
}
