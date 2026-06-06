import { Badge, Card, Icon } from '../../shared/ui';
import { CATEGORY_META, displayProgress, isAutoProgress, milestoneProgress } from './logic';
import { ProgressBar } from './ProgressBar';
import type { Goal } from './types';

interface GoalCardProps {
  goal: Goal;
  onOpen: (goal: Goal) => void;
}

/** Compact goal card for the board + timeline. Click opens the detail. */
export function GoalCard({ goal, onOpen }: GoalCardProps) {
  const meta = goal.category ? CATEGORY_META[goal.category] : null;
  const total = goal.milestones?.length ?? 0;
  const done = goal.milestones?.filter((m) => m.completed).length ?? 0;

  return (
    <Card
      interactive
      flush
      className="cursor-pointer space-y-2 p-3"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(goal)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(goal);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-900">{goal.title}</h3>
        {meta ? (
          <Badge tone="neutral">
            <Icon name={meta.icon} size={12} />
            <span className="ml-1">{meta.label}</span>
          </Badge>
        ) : null}
      </div>

      {goal.description ? (
        <p className="line-clamp-2 text-xs text-ink-500">{goal.description}</p>
      ) : null}

      <ProgressBar
        value={displayProgress(goal)}
        caption={isAutoProgress(goal) ? `${done}/${total} milestones` : undefined}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
        {goal.period ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar" size={12} />
            {goal.period}
          </span>
        ) : null}
        {goal.targetDate ? <span>Due {goal.targetDate}</span> : null}
        {total > 0 && milestoneProgress(goal.milestones) === 100 ? (
          <span className="inline-flex items-center gap-1 text-success-600">
            <Icon name="check" size={12} />
            All milestones done
          </span>
        ) : null}
      </div>
    </Card>
  );
}
