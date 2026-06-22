import { useMemo, useState, type FormEvent } from 'react';
import { Button, DateField, Field, Input, Select, Textarea } from '../../shared/ui';
import { TYPE_LABEL } from './logic';
import { DEFAULT_EXAM, EXAMS, OTHER_EXAM, examDef } from './exams';
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

/** Pick the dropdown value for a stored examName: a known exam id, or "Other" for a custom name. */
function pickerFor(examName?: string): string {
  if (!examName) return DEFAULT_EXAM.id;
  return EXAMS.some((e) => e.id === examName) ? examName : 'Other';
}

/** Log/edit an exam record. The chosen exam drives the score labels + scales; study sessions
 *  collect hours/topics instead of scores. */
export function RecordForm({ initial, busy, error, onSubmit, onCancel, onDelete }: Props) {
  const [type, setType] = useState<ExamType>(initial?.type ?? 'practice-test');
  const [date, setDate] = useState(initial?.date ?? '');
  const [exam, setExam] = useState<string>(pickerFor(initial?.examName));
  const [customExam, setCustomExam] = useState(
    initial?.examName && !EXAMS.some((e) => e.id === initial.examName) ? initial.examName : '',
  );
  const [overall, setOverall] = useState(initial?.overallScore !== undefined ? String(initial.overallScore) : '');
  const [sections, setSections] = useState<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    const init = initial?.sectionScores ?? {};
    for (const [k, v] of Object.entries(init)) s[k] = v !== undefined ? String(v) : '';
    return s;
  });
  const [duration, setDuration] = useState(initial?.studyDuration !== undefined ? String(initial.studyDuration) : '');
  const [topics, setTopics] = useState((initial?.studyTopics ?? []).join(', '));
  const [source, setSource] = useState(initial?.source ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const isSession = type === 'study-session';
  const isOther = exam === 'Other';
  const def = useMemo(() => (isOther ? OTHER_EXAM : examDef(exam)), [exam, isOther]);
  const examName = isOther ? customExam.trim() || 'Other' : exam;

  function submit(e: FormEvent) {
    e.preventDefault();
    const sectionScores: Record<string, number> = {};
    for (const sec of def.sections) {
      const n = numOrUndef(sections[sec.key] ?? '');
      if (n !== undefined) sectionScores[sec.key] = n;
    }
    onSubmit({
      type,
      date,
      examName,
      overallScore: isSession ? undefined : numOrUndef(overall),
      sectionScores: !isSession && Object.keys(sectionScores).length ? sectionScores : undefined,
      studyDuration: isSession ? numOrUndef(duration) : undefined,
      studyTopics: isSession && topics.trim() ? topics.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      source: source.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  }

  const typeField = (
    <Field label="Type">
      <Select value={type} onChange={(e) => setType(e.target.value as ExamType)}>
        {EXAM_TYPES.map((t) => (
          <option key={t} value={t}>{TYPE_LABEL[t]}</option>
        ))}
      </Select>
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Exam">
          <Select value={exam} onChange={(e) => setExam(e.target.value)}>
            {EXAMS.map((x) => (
              <option key={x.id} value={x.id}>{x.label}</option>
            ))}
            <option value="Other">Other / not listed</option>
          </Select>
        </Field>
        {isOther ? (
          <Field label="Exam name" hint="e.g. GRE, DAT, HESI">
            <Input value={customExam} onChange={(e) => setCustomExam(e.target.value)} placeholder="Exam name" />
          </Field>
        ) : (
          typeField
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isOther ? typeField : null}
        <DateField label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>

      {!isSession ? (
        <>
          <p className="rounded-md bg-surface-sunken px-3 py-2 text-xs text-ink-500">{def.hint}</p>
          <Field label={`${def.overall.label} (${def.overall.min}–${def.overall.max})`}>
            <Input
              type="number"
              min={def.overall.min}
              max={def.overall.max}
              value={overall}
              onChange={(e) => setOverall(e.target.value)}
            />
          </Field>
          {def.sections.length ? (
            <div className="grid grid-cols-2 gap-3">
              {def.sections.map((sec) => (
                <Field key={sec.key} label={`${sec.label} (0–${sec.max})`}>
                  <Input
                    type="number"
                    min="0"
                    max={sec.max}
                    value={sections[sec.key] ?? ''}
                    onChange={(e) => setSections((s) => ({ ...s, [sec.key]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
          ) : null}
          <Field label="Test source" hint="Who made this test — e.g. ATI, Mometrix, College Board, Khan Academy — or “Official” for the real exam">
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Official" />
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
