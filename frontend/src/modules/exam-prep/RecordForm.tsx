import { useState, type FormEvent } from 'react';
import { Button, DateField, Field, Input, Select, Textarea } from '../../shared/ui';
import { SECTIONS_ORDER, SECTION_LABEL, TYPE_LABEL } from './logic';
import { EXAM_TYPES, type ExamInput, type ExamRecord, type ExamType } from './types';

interface Props {
  initial?: ExamRecord;
  busy?: boolean;
  error?: string | null;
  onSubmit: (input: ExamInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const numOrUndef = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Log/edit an exam record. Score fields show for tests/exams; duration/topics for study sessions. */
export function RecordForm({ initial, busy, error, onSubmit, onCancel, onDelete }: Props) {
  const [type, setType] = useState<ExamType>(initial?.type ?? 'practice-test');
  const [date, setDate] = useState(initial?.date ?? '');
  const [overall, setOverall] = useState(initial?.overallScore !== undefined ? String(initial.overallScore) : '');
  const [sections, setSections] = useState<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    for (const sec of SECTIONS_ORDER) {
      const v = initial?.sectionScores?.[sec];
      s[sec] = v !== undefined ? String(v) : '';
    }
    return s;
  });
  const [duration, setDuration] = useState(initial?.studyDuration !== undefined ? String(initial.studyDuration) : '');
  const [topics, setTopics] = useState((initial?.studyTopics ?? []).join(', '));
  const [source, setSource] = useState(initial?.source ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const isSession = type === 'study-session';

  function submit(e: FormEvent) {
    e.preventDefault();
    const sectionScores: Record<string, number> = {};
    for (const sec of SECTIONS_ORDER) {
      const n = numOrUndef(sections[sec] ?? '');
      if (n !== undefined) sectionScores[sec] = n;
    }
    onSubmit({
      type,
      date,
      overallScore: isSession ? undefined : numOrUndef(overall),
      sectionScores: !isSession && Object.keys(sectionScores).length ? sectionScores : undefined,
      studyDuration: isSession ? numOrUndef(duration) : undefined,
      studyTopics: isSession && topics.trim() ? topics.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      source: source.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as ExamType)}>
            {EXAM_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </Select>
        </Field>
        <DateField label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>

      {!isSession ? (
        <>
          <Field label="Overall score (%)">
            <Input type="number" min="0" max="100" value={overall} onChange={(e) => setOverall(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {SECTIONS_ORDER.map((sec) => (
              <Field key={sec} label={SECTION_LABEL[sec]}>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={sections[sec] ?? ''}
                  onChange={(e) => setSections((s) => ({ ...s, [sec]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
          <Field label="Source" hint="e.g. ATI, Mometrix, official">
            <Input value={source} onChange={(e) => setSource(e.target.value)} />
          </Field>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Study hours">
            <Input type="number" min="0" step="0.5" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
          <Field label="Topics" hint="comma-separated">
            <Input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="anatomy, chemistry" />
          </Field>
        </div>
      )}

      <Field label="Notes">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {error ? <p className="text-sm text-error-600">{error}</p> : null}

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" loading={busy} disabled={!date}>
          {initial ? 'Save' : 'Log it'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        {initial && onDelete ? (
          <Button type="button" variant="danger" className="ml-auto" onClick={onDelete}>Delete</Button>
        ) : null}
      </div>
    </form>
  );
}
