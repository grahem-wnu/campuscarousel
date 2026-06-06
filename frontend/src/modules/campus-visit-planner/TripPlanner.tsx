import { useState } from 'react';
import { Badge, Button, Card, EmptyState, useToast } from '../../shared/ui';
import { getTripPlan } from './api';
import type { TripPlan } from './types';

/** Trip planner: groups your colleges into regional clusters with suggested itineraries. */
export function TripPlanner() {
  const toast = useToast();
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  async function generate(): Promise<void> {
    setLoading(true);
    try {
      setPlan(await getTripPlan());
      setRan(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build a trip plan.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink-900">Group visits into trips</h3>
          <p className="text-sm text-ink-500">
            Cluster your colleges by region so you can knock out nearby schools in one trip.
          </p>
        </div>
        <Button icon="calendar" loading={loading} onClick={() => void generate()}>
          {ran ? 'Rebuild plan' : 'Build trip plan'}
        </Button>
      </Card>

      {plan ? (
        plan.clusters.length === 0 ? (
          <EmptyState
            icon="school"
            title="No colleges to group yet"
            description="Add colleges in the College Hub (with a state or location), then build a trip plan."
          />
        ) : (
          <div className="space-y-3">
            {plan.source === 'ai' ? (
              <p className="text-xs text-ink-400">Itineraries suggested by AI · grouping is deterministic.</p>
            ) : null}
            {plan.clusters.map((c) => (
              <Card key={c.region} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-ink-900">{c.region}</h4>
                  <Badge tone="info">{c.colleges.length} school{c.colleges.length === 1 ? '' : 's'}</Badge>
                </div>
                <p className="text-sm text-ink-700">{c.itinerary}</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.colleges.map((col) => (
                    <span key={col.collegeId} className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
                      {col.name}
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
