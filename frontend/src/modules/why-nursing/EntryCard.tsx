import { Badge, Button, Card, Icon } from '../../shared/ui';
import { metaFor } from './logic';
import type { WhyNursingEntry } from './types';

// Soft category-marker tints. Keyed on BadgeTone; only the palettes that actually exist in the
// design tokens (primary/secondary/ink/success/warn/error) — `info` reuses the primary tint, as
// the shared Badge does.
const TONE_ACCENT: Record<string, string> = {
  primary: 'bg-primary-100 text-primary-700',
  info: 'bg-primary-50 text-primary-700',
  success: 'bg-success-100 text-success-700',
  warn: 'bg-warn-100 text-warn-700',
  error: 'bg-error-100 text-error-700',
  neutral: 'bg-ink-100 text-ink-600',
};

/** One "Why Nursing" entry in the timeline: category-styled marker, full narrative, links, tags. */
export function EntryCard({
  entry,
  onEdit,
  onDelete,
  canEdit,
}: {
  entry: WhyNursingEntry;
  onEdit?: (entry: WhyNursingEntry) => void;
  onDelete?: (entry: WhyNursingEntry) => void;
  canEdit?: boolean;
}) {
  const meta = metaFor(entry.category);
  const accent = TONE_ACCENT[meta.tone] ?? TONE_ACCENT.neutral;
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${accent}`}>
          <Icon name={meta.icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink-900">{entry.title}</h3>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {entry.visibility === 'private' ? <Badge tone="neutral">Private</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-ink-500">{entry.date}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{entry.content}</p>

          {entry.linkedActivityId || entry.linkedClinicalId ? (
            <p className="mt-2 flex flex-wrap gap-3 text-xs text-ink-500">
              {entry.linkedActivityId ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name="book" size={13} /> Linked activity
                </span>
              ) : null}
              {entry.linkedClinicalId ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name="clinical" size={13} /> Linked clinical entry
                </span>
              ) : null}
            </p>
          ) : null}

          {entry.tags && entry.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.tags.map((t) => (
                <span key={t} className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
                  #{t}
                </span>
              ))}
            </div>
          ) : null}

          {canEdit && (onEdit || onDelete) ? (
            <div className="mt-3 flex gap-2">
              {onEdit ? (
                <Button size="sm" variant="ghost" onClick={() => onEdit(entry)}>
                  Edit
                </Button>
              ) : null}
              {onDelete ? (
                <Button size="sm" variant="ghost" onClick={() => onDelete(entry)}>
                  Delete
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
