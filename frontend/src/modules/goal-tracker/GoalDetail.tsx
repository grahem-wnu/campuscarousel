import { useState } from 'react';
import { Badge, Button, Icon, Select } from '../../shared/ui';
import { deleteGoal, updateGoal } from './api';
import { CATEGORY_META, displayProgress, isAutoProgress, STATUS_META } from './logic';
import { ProgressBar } from './ProgressBar';
import { STATUSES, type Goal, type Status } from './types';

interface GoalDetailProps {
  goal: Goal;
  onUpdated: (goal: Goal) => void;
  onDeleted: (id: string) => void;
  onEdit: (goal: Goal) => void;
}

/** Goal detail: progress bar, status control, milestone checkboxes (auto-saved), linked activities,
 *  and edit/delete. Milestone + status changes persist immediately via PUT /goals/:id. */
export function GoalDetail({ goal, onUpdated, onDeleted, onEdit }: GoalDetailProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta = goal.category ? CATEGORY_META[goal.category] : null;

  async function persist(patch: Parameters<typeof updateGoal>[1]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateGoal(goal.goalId, patch);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your change.');
    } finally {
      setBusy(false);
    }
  }

  function toggleMilestone(id: string, completed: boolean) {
    // Send every milestone back, preserving each one's existing completedDate so toggling one does
    // not re-stamp the others. The toggled milestone omits completedDate when newly completed so the
    // server stamps today (and clears it when un-completed).
    const milestones = (goal.milestones ?? []).map((m) =>
      m.id === id
        ? { id: m.id, label: m.label, completed }
        : { id: m.id, label: m.label, completed: m.completed, completedDate: m.completedDate },
    );
    void persist({ milestones });
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteGoal(goal.goalId);
      onDeleted(goal.goalId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the goal.');
      setBusy(false);
    }
  }

  const total = goal.milestones?.length ?? 0;
  const done = goal.milestones?.filter((m) => m.completed).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {meta ? (
          <Badge tone="neutral">
            <Icon name={meta.icon} size={12} />
            <span className="ml-1">{meta.label}</span>
          </Badge>
        ) : null}
        {goal.status ? <Badge tone={STATUS_META[goal.status].tone}>{STATUS_META[goal.status].label}</Badge> : null}
        {goal.period ? <span className="text-xs text-ink-500">{goal.period}</span> : null}
        {goal.targetDate ? <span className="text-xs text-ink-500">Due {goal.targetDate}</span> : null}
      </div>

      {goal.description ? <p className="whitespace-pre-wrap text-sm text-ink-700">{goal.description}</p> : null}

      <ProgressBar
        value={displayProgress(goal)}
        caption={isAutoProgress(goal) ? `${done}/${total} milestones · auto` : 'manual'}
      />

      <div className="max-w-xs">
        <label className="mb-1 block text-xs font-medium text-ink-600">Status</label>
        <Select
          value={goal.status ?? 'not-started'}
          disabled={busy}
          onChange={(e) => void persist({ status: e.target.value as Status })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </Select>
      </div>

      {total > 0 ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink-800">Milestones</h4>
          <ul className="space-y-1.5">
            {goal.milestones!.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={m.completed ?? false}
                  disabled={busy}
                  onChange={(e) => toggleMilestone(m.id, e.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 text-primary-600"
                />
                <span className={m.completed ? 'text-ink-400 line-through' : 'text-ink-800'}>{m.label}</span>
                {m.completed && m.completedDate ? (
                  <span className="ml-auto text-xs text-ink-400">{m.completedDate}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {goal.linkedActivities?.length ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink-800">Linked activities</h4>
          <div className="flex flex-wrap gap-1.5">
            {goal.linkedActivities.map((a) => (
              <Badge key={a} tone="info">
                {a}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-error-700">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 pt-4">
        <Button variant="outline" icon="goal" onClick={() => onEdit(goal)} disabled={busy}>
          Edit goal
        </Button>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-600">Delete this goal?</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={busy} onClick={() => void remove()}>
              Delete
            </Button>
          </div>
        ) : (
          <Button variant="ghost" icon="close" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
