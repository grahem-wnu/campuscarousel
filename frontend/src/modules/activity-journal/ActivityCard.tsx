import { Badge, Card, Icon } from '../../shared/ui';
import { CATEGORY_META } from './logic';
import type { Activity } from './types';

/** One journal entry, shown in the timeline (spacious density per the spec). */
export function ActivityCard({ activity, onClick }: { activity: Activity; onClick?: () => void }) {
  const meta = CATEGORY_META[activity.category];
  return (
    <Card interactive={Boolean(onClick)} onClick={onClick} className="cursor-default">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <Icon name={meta.icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink-900">{activity.title}</h3>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {activity.visibility === 'private' ? (
              <Badge tone="neutral">Private</Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-ink-500">
            {activity.date}
            {activity.subcategory ? ` · ${activity.subcategory}` : ''}
            {typeof activity.hours === 'number' ? ` · ${activity.hours} hr` : ''}
            {` · logged by ${activity.userId}`}
          </p>
          {activity.description ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{activity.description}</p>
          ) : null}
          {activity.reflection ? (
            <p className="mt-2 rounded-md bg-secondary-50 p-2 text-sm italic text-ink-700">
              {activity.reflection}
            </p>
          ) : null}
          {activity.tags && activity.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activity.tags.map((t) => (
                <span key={t} className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
                  #{t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
