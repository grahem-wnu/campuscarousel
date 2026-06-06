import { useState, type FormEvent } from 'react';
import { Button, DateField, Field, Input, Textarea } from '../../shared/ui';
import type { Interview, InterviewInput } from './types';

interface Props {
  initial?: Interview;
  busy?: boolean;
  onSubmit: (input: InterviewInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

/** Log (or edit) a real interview: date, school, how it went, confidence, post-notes. The school +
 *  interviewer + questions go into overallNotes since the frozen Interview type keeps the schema lean. */
export function RealLogForm({ initial, busy, onSubmit, onCancel, onDelete }: Props) {
  const [date, setDate] = useState(initial?.date ?? '');
  const [collegeId, setCollegeId] = useState(initial?.collegeId ?? '');
  const [notes, setNotes] = useState(initial?.overallNotes ?? '');
  const [confidence, setConfidence] = useState(initial?.confidenceLevel ? String(initial.confidenceLevel) : '');

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      type: 'real-interview',
      date,
      collegeId: collegeId.trim() || undefined,
      overallNotes: notes.trim() || undefined,
      confidenceLevel: confidence ? Number(confidence) : undefined,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateField label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Field label="School / college id">
          <Input value={collegeId} onChange={(e) => setCollegeId(e.target.value)} placeholder="college id or name" />
        </Field>
        <Field label="How confident did you feel? (1–5)">
          <Input type="number" min="1" max="5" value={confidence} onChange={(e) => setConfidence(e.target.value)} className="w-24" />
        </Field>
      </div>
      <Field label="How it went / questions asked / thank-you sent">
        <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Interviewer, questions they asked, how you felt, follow-up notes…" />
      </Field>
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" loading={busy} disabled={!date}>{initial ? 'Save' : 'Log interview'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        {initial && onDelete ? <Button type="button" variant="danger" className="ml-auto" onClick={onDelete}>Delete</Button> : null}
      </div>
    </form>
  );
}
