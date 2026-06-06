import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, Modal, Select, Spinner } from '../../shared/ui';
import { createEssay, deleteEssay, listEssays } from './api';
import { EssayForm } from './EssayForm';
import { EssayWorkspace } from './EssayWorkspace';
import { STATUS_META, latestDraft, wordCount } from './logic';
import { ESSAY_STATUSES, type Essay, type EssayInput, type EssayStatus } from './types';

/** Application Central — the essay workspace. Lists essays, opens the writing workspace, and creates
 *  new ones. (Application tracker / rec board / score tracker arrive once their data-layer entities
 *  land — raised on the checkpoint.) */
export default function EssaysPage() {
  const [essays, setEssays] = useState<Essay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<EssayStatus | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEssays(await listEssays({ status: status || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your essays.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useMemo(() => essays.find((e) => e.essayId === openId) ?? null, [essays, openId]);

  function applyUpdate(u: Essay) {
    setEssays((p) => p.map((e) => (e.essayId === u.essayId ? u : e)));
  }

  async function handleCreate(input: EssayInput) {
    const created = await createEssay(input);
    setEssays((p) => [created, ...p]);
    setShowCreate(false);
    setOpenId(created.essayId);
  }

  async function remove(id: string) {
    await deleteEssay(id);
    setEssays((p) => p.filter((e) => e.essayId !== id));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Essays</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Your application essays — draft, pull in your real experiences, and get feedback (never a rewrite).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Field label="">
            <Select value={status} onChange={(e) => setStatus(e.target.value as EssayStatus | '')} aria-label="Filter by status">
              <option value="">All statuses</option>
              {ESSAY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Button icon="plus" onClick={() => setShowCreate(true)}>
            New essay
          </Button>
        </div>
      </header>

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
      ) : essays.length === 0 ? (
        <EmptyState
          icon="application"
          title="No essays yet"
          description="Start an essay, then use 'Find experiences' to surface the journal, clinical, and Why Nursing moments that fit the prompt."
          action={
            <Button icon="plus" onClick={() => setShowCreate(true)}>
              Start your first essay
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {essays.map((e) => {
            const draft = latestDraft(e.drafts);
            return (
              <Card key={e.essayId} interactive flush className="cursor-pointer space-y-2 p-3" role="button" tabIndex={0}
                onClick={() => setOpenId(e.essayId)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpenId(e.essayId); } }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-medium text-ink-900">{e.prompt || '(no prompt yet)'}</p>
                  {e.status ? <Badge tone={STATUS_META[e.status].tone}>{STATUS_META[e.status].label}</Badge> : null}
                </div>
                <div className="flex items-center justify-between text-xs text-ink-400">
                  <span>{e.promptSource || e.collegeId || '—'}</span>
                  <span>{draft ? `v${draft.version} · ${draft.wordCount ?? wordCount(draft.content)} words` : 'no draft'}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New essay" size="lg">
        <EssayForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
      </Modal>

      <Modal
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        title={open?.prompt ? open.prompt.slice(0, 80) : 'Essay workspace'}
        size="lg"
        footer={
          open ? (
            <Button
              variant="ghost"
              size="sm"
              icon="close"
              onClick={() => {
                const id = open.essayId;
                setOpenId(null);
                void remove(id);
              }}
            >
              Delete essay
            </Button>
          ) : null
        }
      >
        {open ? <EssayWorkspace essay={open} onUpdated={applyUpdate} /> : null}
      </Modal>
    </div>
  );
}
