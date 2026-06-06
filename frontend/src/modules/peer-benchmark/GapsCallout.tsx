import { Badge, Button, Card, Spinner } from '../../shared/ui';
import { severityTone } from './logic';
import type { GapsAnalysis } from './types';

/** The AI biggest-gaps callout: a summary plus prioritized, actionable recommendations. */
export function GapsCallout({
  analysis,
  loading,
  error,
  onRetry,
}: {
  analysis: GapsAnalysis | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-ink-900">Biggest gaps</h2>
        {!loading ? (
          <Button size="sm" variant="ghost" icon="search" onClick={onRetry}>
            {error || !analysis ? 'Try again' : 'Re-analyze'}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : error ? (
        <p className="mt-2 text-sm text-ink-500">{error}</p>
      ) : analysis ? (
        <>
          {analysis.summary ? <p className="mt-2 text-sm text-ink-700">{analysis.summary}</p> : null}
          {analysis.gaps.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {analysis.gaps.map((g, i) => (
                <li key={`${g.metric}-${i}`} className="rounded-md border border-surface-border p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-800">{g.metric}</span>
                    <Badge tone={severityTone(g.severity)}>{g.severity}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-700">{g.recommendation}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-500">No standout gaps — keep it up.</p>
          )}
        </>
      ) : null}
    </Card>
  );
}
