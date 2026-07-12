import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Spinner } from '../../shared/ui';
import { groupEssaysByCollege } from './logic';
import { listCollegeOptions, listEssays } from './api';
import type { CollegeOption, Essay } from './types';

interface Props {
  onStart: (college: { collegeId: string; name: string }) => void;
  onOpen: (college: { collegeId: string; name: string }) => void;
}

/** The Essay Center's home: the college roster is the spine, so every school — even one with no
 *  attempts yet — offers a one-tap "Start essay". Practice counts come from the essays keyed by
 *  collegeId; legacy essays with no collegeId are ignored (no phantom college rows). */
export function CollegeEssayList({ onStart, onOpen }: Props) {
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([listCollegeOptions(), listEssays()])
      .then(([options, essays]) => {
        if (!live) return;
        // Count per collegeId; essays with no collegeId land under '' and never match a real id.
        const byId = new Map<string, number>();
        for (const group of groupEssaysByCollege(essays, (e: Essay) => e.collegeId ?? '')) {
          if (group.label) byId.set(group.label, group.essays.length);
        }
        setColleges(options);
        setCounts(byId);
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : 'Could not load your colleges.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border border-error-200 bg-error-50 text-error-700">
        <p className="text-sm">{error}</p>
      </Card>
    );
  }

  if (colleges.length === 0) {
    return (
      <EmptyState
        icon="application"
        title="Add a college to start writing"
        description="Your Essay Center is organized by school. Add a college to your list and I’ll pull up the kinds of essay questions it asks — you write, I coach you. I never write it for you."
      />
    );
  }

  return (
    <div className="space-y-2">
      {colleges.map((c) => {
        const count = counts.get(c.collegeId) ?? 0;
        const college = { collegeId: c.collegeId, name: c.name };
        return (
          <div
            key={c.collegeId}
            className="flex items-center justify-between gap-3 rounded-md bg-surface-raised p-3 shadow-sm"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{c.name}</p>
              <p className="mt-0.5 text-xs text-ink-500">
                {count > 0 ? `${count} practice essay${count === 1 ? '' : 's'}` : 'no practice yet'}
              </p>
            </div>
            {count > 0 ? (
              <Button size="sm" variant="outline" onClick={() => onOpen(college)}>
                Essays →
              </Button>
            ) : (
              <Button size="sm" onClick={() => onStart(college)}>
                Start essay
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
