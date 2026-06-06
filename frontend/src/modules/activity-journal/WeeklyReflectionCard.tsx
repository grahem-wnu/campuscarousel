import { useState } from 'react';
import { Button, Card, Field, Textarea, useToast } from '../../shared/ui';
import { createActivity } from './api';
import { ACTIVITY_CREATED_EVENT } from './QuickAddForm';
import { REFLECTION_TAG, reflectionPromptFor } from './logic';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The once-a-week rotating reflection prompt. Saves a `personal` entry tagged as a reflection —
 *  the raw material for essays later. */
export function WeeklyReflectionCard({ onSaved }: { onSaved?: () => void }) {
  const toast = useToast();
  const today = todayIso();
  const prompt = reflectionPromptFor(today);
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    if (!answer.trim()) {
      toast.error('Write a sentence or two first.');
      return;
    }
    setSaving(true);
    try {
      await createActivity({
        date: today,
        category: 'personal',
        title: prompt,
        reflection: answer.trim(),
        tags: [REFLECTION_TAG],
      });
      toast.success('Reflection saved.');
      setAnswer('');
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ACTIVITY_CREATED_EVENT));
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your reflection.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border border-secondary-200 bg-secondary-50">
      <p className="text-xs font-semibold uppercase tracking-wide text-secondary-700">This week’s reflection</p>
      <p className="mt-1 text-base font-medium text-ink-900">{prompt}</p>
      <Field className="mt-3">
        <Textarea
          rows={3}
          placeholder="Capture it while it’s fresh…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </Field>
      <div className="mt-2 flex justify-end">
        <Button onClick={save} loading={saving} variant="secondary">
          Save reflection
        </Button>
      </div>
    </Card>
  );
}
