import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, Modal, Spinner, Tabs, type TabItem } from '../../shared/ui';
import { createGoal, listGoals, updateGoal } from './api';
import { GoalCard } from './GoalCard';
import { GoalDetail } from './GoalDetail';
import { GoalForm, emptyForm, type GoalFormValues } from './GoalForm';
import { SuggestGoals } from './SuggestGoals';
import { BOARD_COLUMNS, groupByPeriod, groupByStatus } from './logic';
import { type Goal, type GoalInput } from './types';

type ViewId = 'board' | 'timeline';

/** Map a Goal back to editable form values. */
function toFormValues(g: Goal): GoalFormValues {
  return emptyForm({
    title: g.title,
    description: g.description ?? '',
    category: g.category ?? '',
    period: g.period ?? '',
    targetDate: g.targetDate ?? '',
    status: g.status ?? 'not-started',
    progress: g.progress != null ? String(g.progress) : '',
    milestones: (g.milestones ?? []).map((m) => ({ ...m })),
  });
}

/** Goal Tracker — board (kanban) + timeline views, AI suggestions, and goal detail/edit. */
export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewId>('board');

  const [showCreate, setShowCreate] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [selected, setSelected] = useState<Goal | null>(null);
  const [editing, setEditing] = useState<Goal | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGoals(await listGoals());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your goals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = goals;
  const byStatus = useMemo(() => groupByStatus(visible), [visible]);
  const byPeriod = useMemo(() => groupByPeriod(visible), [visible]);

  // Keep the open detail in sync after an inline update, and reflect changes into the list.
  function applyUpdate(updated: Goal) {
    setGoals((prev) => prev.map((g) => (g.goalId === updated.goalId ? updated : g)));
    setSelected((prev) => (prev?.goalId === updated.goalId ? updated : prev));
  }

  function applyDelete(id: string) {
    setGoals((prev) => prev.filter((g) => g.goalId !== id));
    setSelected(null);
  }

  async function handleCreate(input: GoalInput) {
    const created = await createGoal(input);
    setGoals((prev) => [created, ...prev]);
    setShowCreate(false);
  }

  async function handleEditSave(input: GoalInput) {
    if (!editing) return;
    const updated = await updateGoal(editing.goalId, input);
    applyUpdate(updated);
    setEditing(null);
    setSelected((prev) => (prev?.goalId === updated.goalId ? updated : prev));
  }

  const views: TabItem[] = [
    { id: 'board', label: 'Board' },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Goals</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Map your path to college — year by year, milestone by milestone.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon="star" onClick={() => setShowSuggest(true)}>
            Suggest goals
          </Button>
          <Button icon="plus" onClick={() => setShowCreate(true)}>
            New goal
          </Button>
        </div>
      </header>

      <Tabs items={views} value={view} onChange={(id) => setView(id as ViewId)} />

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          icon="goal"
          title="No goals yet"
          description="Set goals mapped to your 4-year plan — or let the assistant suggest a starting set you can edit."
          action={
            <div className="flex gap-2">
              <Button variant="outline" icon="star" onClick={() => setShowSuggest(true)}>
                Suggest goals
              </Button>
              <Button icon="plus" onClick={() => setShowCreate(true)}>
                Add your first goal
              </Button>
            </div>
          }
        />
      ) : view === 'board' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {BOARD_COLUMNS.map((col) => (
            <div key={col.status} className="space-y-2">
              <h2 className="flex items-center justify-between text-sm font-semibold text-ink-700">
                {col.label}
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-500">
                  {byStatus[col.status].length}
                </span>
              </h2>
              <div className="space-y-2">
                {byStatus[col.status].map((g) => (
                  <GoalCard key={g.goalId} goal={g} onOpen={setSelected} />
                ))}
                {byStatus[col.status].length === 0 ? (
                  <p className="rounded-lg border border-dashed border-ink-200 py-6 text-center text-xs text-ink-400">
                    Nothing here
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {byPeriod.map((group) => (
            <section key={group.period} className="space-y-2">
              <h2 className="text-sm font-semibold text-ink-700">{group.period}</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.goals.map((g) => (
                  <GoalCard key={g.goalId} goal={g} onOpen={setSelected} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New goal">
        <GoalForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
      </Modal>

      <Modal open={showSuggest} onClose={() => setShowSuggest(false)} title="Suggest goals" size="lg">
        <SuggestGoals
          onCancel={() => setShowSuggest(false)}
          onSaved={(n) => {
            setShowSuggest(false);
            void load();
            if (n) setView('board');
          }}
        />
      </Modal>

      <Modal
        open={Boolean(selected) && !editing}
        onClose={() => setSelected(null)}
        title={selected?.title}
        size="lg"
      >
        {selected ? (
          <GoalDetail
            goal={selected}
            onUpdated={applyUpdate}
            onDeleted={applyDelete}
            onEdit={(g) => setEditing(g)}
          />
        ) : null}
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit goal">
        {editing ? (
          <GoalForm
            initial={toFormValues(editing)}
            submitLabel="Save changes"
            onSubmit={handleEditSave}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
