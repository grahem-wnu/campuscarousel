import { ActivityCard } from './ActivityCard';
import { sortByDateDesc } from './logic';
import type { Activity } from './types';

/** Chronological feed, newest first. */
export function TimelineView({ activities }: { activities: Activity[] }) {
  const ordered = sortByDateDesc(activities);
  return (
    <div className="space-y-3">
      {ordered.map((a) => (
        <ActivityCard key={a.activityId} activity={a} />
      ))}
    </div>
  );
}
