import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Field, Icon, Input, Select, Spinner } from '../../shared/ui';
import { CATEGORY_LABEL } from './logic';
import { addQuestion, listQuestions } from './api';
import { QUESTION_CATEGORIES, type BankQuestion, type Category } from './types';

/** Browse the curated + custom question bank, filter it, and add your own must-prepare questions. */
export function QuestionBankView() {
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [category, setCategory] = useState<Category | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [draftCat, setDraftCat] = useState<Category>('behavioral');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setQuestions(await listQuestions({ category: category || undefined, search: search || undefined }));
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await addQuestion(draft.trim(), draftCat, true);
      setDraft('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card flush className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search" className="min-w-[10rem] flex-1">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…" />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
              <option value="">All</option>
              {QUESTION_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <ul className="space-y-2">
          {questions.map((q) => (
            <li key={q.id} className="flex items-start gap-2 rounded-md bg-surface-raised p-3 shadow-sm">
              {q.starred ? <Icon name="star" size={16} className="mt-0.5 shrink-0 text-warn-500" /> : <span className="w-4" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-900">{q.question}</p>
                <Badge tone="neutral" className="mt-1">{CATEGORY_LABEL[q.category]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold text-ink-800">Add a must-prepare question</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Question" className="min-w-[12rem] flex-1">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. How do you handle conflict on a care team?" />
          </Field>
          <Field label="Category">
            <Select value={draftCat} onChange={(e) => setDraftCat(e.target.value as Category)}>
              {QUESTION_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
          </Field>
          <Button icon="plus" loading={saving} disabled={!draft.trim()} onClick={() => void add()}>Add</Button>
        </div>
      </Card>
    </div>
  );
}
