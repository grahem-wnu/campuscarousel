import { Badge, Button, Card, Icon } from '../../shared/ui';
import { formatHours } from './logic';
import { DEFAULT_EXPERIENCE_VOCAB, type ExperienceEntry, type ExperienceVocab } from './types';

/** One experience-hours entry in the list. */
export function ExperienceCard({
  entry,
  vocab = DEFAULT_EXPERIENCE_VOCAB,
  canModify,
  onDelete,
}: {
  entry: ExperienceEntry;
  vocab?: ExperienceVocab;
  canModify: boolean;
  onDelete?: (entry: ExperienceEntry) => void;
}) {
  return (
    <Card className="cursor-default">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-info-100 text-info-700">
          <Icon name="clinical" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink-900">{entry.facility}</h3>
            {entry.department ? <Badge tone="info">{entry.department}</Badge> : null}
            <Badge tone="primary">{formatHours(entry.hours)} hrs</Badge>
            {entry.patientInteraction && vocab.highlightLabel ? <Badge tone="success">{vocab.highlightLabel}</Badge> : null}
            {entry.visibility === 'private' ? <Badge tone="neutral">Private</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-ink-500">
            {entry.date}
            {entry.supervisorName ? ` · ${entry.supervisorName}` : ''}
            {entry.supervisorTitle ? ` (${entry.supervisorTitle})` : ''}
          </p>
          {entry.duties && entry.duties.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.duties.map((d) => (
                <span key={d} className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
                  {d}
                </span>
              ))}
            </div>
          ) : null}
          {entry.reflection ? (
            <p className="mt-2 rounded-md bg-secondary-50 p-2 text-sm italic text-ink-700">
              {entry.reflection}
            </p>
          ) : null}
        </div>
        {canModify && onDelete ? (
          <Button size="sm" variant="ghost" icon="close" aria-label="Delete entry" onClick={() => onDelete(entry)} />
        ) : null}
      </div>
    </Card>
  );
}
