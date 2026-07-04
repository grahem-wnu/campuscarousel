import { useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Spinner, useToast } from '../../shared/ui';
import { RECOMMENDATION_STATUS_META, SLOT_LABELS } from './logic';
import {
  createRecommendation,
  deleteRecommendation,
  generateRecommenderBrief,
  listRecommendations,
  updateRecommendation,
} from './api';
import {
  RECOMMENDATION_SLOTS,
  RECOMMENDATION_STATUSES,
  type Recommendation,
  type RecommendationSlot,
  type RecommendationStatus,
  type RecommenderBrief,
} from './types';

/** Recommendation strategy board — the four canonical letter slots, who's assigned, where each
 *  ask stands, and a per-recommender AI brief (grounded only in family-visible experiences). */
export function RecommendationBoard() {
  const toast = useToast();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [slot, setSlot] = useState<RecommendationSlot>('stem-teacher');
  const [contactName, setContactName] = useState('');
  const [adding, setAdding] = useState(false);

  const [briefFor, setBriefFor] = useState<string | null>(null);
  const [brief, setBrief] = useState<RecommenderBrief | null>(null);

  async function load() {
    setError(null);
    try {
      setRecs(await listRecommendations());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load recommenders.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function add() {
    setAdding(true);
    try {
      await createRecommendation({ slot, contactName: contactName.trim() || undefined });
      setContactName('');
      await load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not add recommender.', 'error');
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(rec: Recommendation, status: RecommendationStatus) {
    const updated = await updateRecommendation(rec.recommendationId, { status });
    setRecs((prev) => prev.map((r) => (r.recommendationId === updated.recommendationId ? updated : r)));
  }

  async function remove(rec: Recommendation) {
    await deleteRecommendation(rec.recommendationId);
    setRecs((prev) => prev.filter((r) => r.recommendationId !== rec.recommendationId));
  }

  async function makeBrief(rec: Recommendation) {
    setBriefFor(rec.recommendationId);
    setBrief(null);
    try {
      const { brief: b } = await generateRecommenderBrief(rec.recommendationId);
      setBrief(b);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not generate brief.', 'error');
      setBriefFor(null);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error) return <Card className="border border-error-200 bg-error-50 text-error-700"><p className="text-sm">{error}</p></Card>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">
        Most colleges ask for 2–4 recommendation letters, each written by an adult who knows the
        student — a teacher, a supervisor, a coach. Plan the asks here: add each person, track the
        ask from Identified to Submitted, and generate a one-page brief to hand them so their letter
        is specific. Letters themselves are never pasted here — recommenders send them to colleges
        directly.
      </p>

      <Card>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Type of letter" hint="Admissions offices want a mix — one from each type is the classic four.">
            <Select value={slot} onChange={(e) => setSlot(e.target.value as RecommendationSlot)}>
              {RECOMMENDATION_SLOTS.map((s) => (
                <option key={s} value={s}>{SLOT_LABELS[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Recommender's name (optional)" hint="The teacher or mentor you plan to ask — leave blank if undecided.">
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Ms. Alvarez" />
          </Field>
          <Button icon="plus" loading={adding} onClick={() => void add()}>Plan this letter</Button>
        </div>
      </Card>

      {recs.length === 0 ? (
        <EmptyState
          icon="application"
          title="No letters planned yet"
          description="Start with the classic four: a STEM teacher, a humanities teacher, a clinical/volunteer supervisor, and a community leader. Add one above."
        />
      ) : (
        recs.map((rec) => {
          const meta = RECOMMENDATION_STATUS_META[rec.status ?? 'identified'];
          return (
            <Card key={rec.recommendationId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{SLOT_LABELS[rec.slot]}</p>
                  <p className="text-xs text-ink-500">{rec.contactName || 'Unassigned'}{rec.submittedColleges?.length ? ` · sent to ${rec.submittedColleges.length}` : ''}</p>
                </div>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Select value={rec.status ?? 'identified'} onChange={(e) => void setStatus(rec, e.target.value as RecommendationStatus)} className="max-w-[12rem]">
                  {RECOMMENDATION_STATUSES.map((s) => (
                    <option key={s} value={s}>{RECOMMENDATION_STATUS_META[s].label}</option>
                  ))}
                </Select>
                <Button variant="secondary" icon="chat" onClick={() => void makeBrief(rec)}>AI brief</Button>
                <Button variant="ghost" icon="close" onClick={() => void remove(rec)}>Remove</Button>
              </div>

              {briefFor === rec.recommendationId ? (
                <div className="mt-3 rounded-md bg-surface-sunken p-3 text-sm">
                  {brief === null ? (
                    <div className="flex items-center gap-2 text-ink-500"><Spinner size={16} /> Generating a shareable brief…</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge tone="success">No private content</Badge>
                        <span className="text-xs text-ink-400">{brief.source === 'ai' ? 'AI-generated' : 'Suggested'}</span>
                      </div>
                      <p className="text-ink-700">{brief.summary}</p>
                      {brief.talkingPoints.length > 0 && (
                        <ul className="list-disc space-y-0.5 pl-5 text-ink-700">
                          {brief.talkingPoints.map((t, i) => <li key={i}>{t}</li>)}
                        </ul>
                      )}
                      {brief.suggestedStories.length > 0 && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Stories they could mention</p>
                          <ul className="list-disc space-y-0.5 pl-5 text-ink-700">
                            {brief.suggestedStories.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </Card>
          );
        })
      )}
    </div>
  );
}
