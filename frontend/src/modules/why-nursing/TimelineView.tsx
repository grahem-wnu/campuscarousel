import { EntryCard } from './EntryCard';
import { sortByDateDesc } from './logic';
import type { WhyNursingEntry } from './types';

/** Chronological stream of the "why", newest first — shows the evolution over months/years. */
export function TimelineView({
  entries,
  onEdit,
  onDelete,
  canEdit,
}: {
  entries: WhyNursingEntry[];
  onEdit?: (entry: WhyNursingEntry) => void;
  onDelete?: (entry: WhyNursingEntry) => void;
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
