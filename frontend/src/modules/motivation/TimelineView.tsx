import { EntryCard } from './EntryCard';
import { sortByDateDesc } from './logic';
import type { MotivationEntry } from './types';

/** Chronological stream of the "why", newest first — shows the evolution over months/years. */
export function TimelineView({
  entries,
  onEdit,
  onDelete,
  canEdit,
}: {
  entries: MotivationEntry[];
  onEdit?: (entry: MotivationEntry) => void;
  onDelete?: (entry: MotivationEntry) => void;
  canEdit?: boolean;
}) {
  const ordered = sortByDateDesc(entries);
  return (
    <div className="space-y-3">
      {ordered.map((e) => (
        <EntryCard key={e.entryId} entry={e} onEdit={onEdit} onDelete={onDelete} canEdit={canEdit} />
      ))}
    </div>
  );
}
