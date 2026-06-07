import { Badge, Card, Icon } from '../../shared/ui';
import { ratingTone } from './logic';
import type { AnswerFeedback } from './types';

/** Five-dot rating. */
function Rating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={14} className={n <= rating ? 'text-warn-500' : 'text-ink-300'} />
      ))}
    </span>
  );
}

/** Per-answer coaching: rating, strengths, what's missing, suggestions, experiences to cite. */
export function FeedbackCard({ feedback }: { feedback: AnswerFeedback }) {
  return (
    <Card className="space-y-3 border border-primary-200 bg-primary-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rating rating={feedback.rating} />
          <Badge tone={ratingTone(feedback.rating)}>{feedback.rating}/5</Badge>
        </div>
        {feedback.source === 'curated' ? <Badge tone="neutral">offline coach</Badge> : <Badge tone="primary">AI coach</Badge>}
      </div>

      {feedback.strengths.length ? (
        <Section icon="check" tone="text-success-700" title="Strengths" items={feedback.strengths} />
      ) : null}
      {feedback.improvements.length ? (
        <Section icon="warning" tone="text-warn-700" title="What's missing" items={feedback.improvements} />
      ) : null}
      {feedback.suggestions.length ? (
        <Section icon="info" tone="text-ink-600" title="Suggestions" items={feedback.suggestions} />
      ) : null}
      {feedback.references.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Cite your experience</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {feedback.references.map((r) => (
              <Badge key={r} tone="info">{r}</Badge>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function Section({ icon, tone, title, items }: { icon: 'check' | 'warning' | 'info'; tone: string; title: string; items: string[] }) {
  return (
    <div>
      <p className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>
        <Icon name={icon} size={13} /> {title}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-700">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
