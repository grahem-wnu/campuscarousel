import { useEffect, useState } from 'react';
import { Button, Card, Input } from '../../shared/ui';
import { createEssay, getPracticeQuestionsForCollege } from './api';
import type { CollegeOption, Essay, PracticeQuestionSet } from './types';

interface Props {
  colleges: CollegeOption[];
  initialCollegeId?: string;
  onWrite: (essay: Essay) => void;
  onCancel: () => void;
}

/** Where the questions came from — threaded into createEssay so the attempt keeps its school. */
type Origin = { collegeId?: string; collegeName?: string };

/** Questions-first front door for the essay coach: pick a school, get its real (or clearly-disclosed
 *  generic) essay questions, then "Write about this one" to start a coached practice attempt. */
export function EssayCoachStart({ colleges, initialCollegeId, onWrite, onCancel }: Props) {
  const [typedName, setTypedName] = useState('');
  const [origin, setOrigin] = useState<Origin>({});
  const [set, setSet] = useState<PracticeQuestionSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [writingIdx, setWritingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadQuestions(o: Origin) {
    setOrigin(o);
    setLoading(true);
    setError(null);
    try {
      setSet(await getPracticeQuestionsForCollege(o));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load practice questions.');
    } finally {
      setLoading(false);
    }
  }

  // Pre-seeded from the overview's "Start an essay" → jump straight to that school's questions.
  useEffect(() => {
    if (initialCollegeId) void loadQuestions({ collegeId: initialCollegeId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCollegeId]);

  async function write(question: string, idx: number) {
    setWritingIdx(idx);
    setError(null);
    try {
      const essay = await createEssay({
        collegeId: origin.collegeId,
        collegeName: origin.collegeName,
        prompt: question,
        promptSource: set?.usedRealPrompts ? 'college' : 'practice',
      });
      onWrite(essay);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the essay.');
      setWritingIdx(null);
    }
  }

  // Step 2 — questions
  if (set) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => setSet(null)}>← Pick a different school</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
        {set.usedRealPrompts === false ? (
          <Card className="border border-secondary-200 bg-secondary-50">
            <p className="text-sm text-ink-700">
              I couldn’t find {set.collegeName ?? 'this school'}’s current essay questions, so these are general
              practice prompts of the kind admissions essays ask.
            </p>
          </Card>
        ) : null}
        <div className="space-y-2">
          {set.questions.map((q, i) => (
            <Card key={i} className="space-y-1.5">
              <p className="font-serif text-base text-ink-900">{q.question}</p>
              {q.why ? <p className="text-xs text-ink-500">{q.why}</p> : null}
              {q.tip ? <p className="text-xs italic text-primary-700">Tip: {q.tip}</p> : null}
              <div>
                <Button size="sm" loading={writingIdx === i} onClick={() => void write(q.question, i)}>
                  Write about this one
                </Button>
              </div>
            </Card>
          ))}
        </div>
        {error ? <p className="text-sm text-error-600">{error}</p> : null}
      </div>
    );
  }

  // Step 1 — school picker (roster schools are buttons that load immediately; typed + general below)
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink-900">Essay coach</h2>
        <p className="mt-0.5 text-sm text-ink-600">
          Practice writing real admissions essays. Pick a school — I’ll pull up the kinds of questions it
          asks, you write, and I coach you. I never write the essay for you.
        </p>
      </div>
      {colleges.length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Your schools</p>
          <div className="flex flex-wrap gap-2">
            {colleges.map((c) => (
              <Button key={c.collegeId} size="sm" variant="outline" onClick={() => void loadQuestions({ collegeId: c.collegeId })}>
                {c.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-500" htmlFor="coach-typed-school">
          Practice on a different school
        </label>
        <div className="flex gap-2">
          <Input
            id="coach-typed-school"
            aria-label="Practice on a different school"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="e.g. Duke University"
          />
          <Button
            loading={loading}
            disabled={!typedName.trim()}
            onClick={() => void loadQuestions({ collegeName: typedName.trim() })}
          >
            See questions
          </Button>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => void loadQuestions({})}>General practice (no school)</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      {error ? <p className="text-sm text-error-600">{error}</p> : null}
    </Card>
  );
}
