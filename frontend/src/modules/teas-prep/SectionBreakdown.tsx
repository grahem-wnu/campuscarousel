import { Badge } from '../../shared/ui';
import { BAND_BAR, BAND_TONE, sectionRows } from './logic';
import type { ProgressPoint } from './types';

interface Props {
  progression: ProgressPoint[];
  target?: number;
}

/** Per-section breakdown of the latest attempt with green/yellow/red color coding + target marker. */
export function SectionBreakdown({ progression, target = 78 }: Props) {
  const rows = sectionRows(progression);
  if (rows.every((r) => r.score === undefined)) return null;

  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.section}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-700">{row.label}</span>
            {row.score !== undefined && row.band ? (
              <Badge tone={BAND_TONE[row.band]}>{row.score}</Badge>
            ) : (
              <span className="text-xs text-ink-400">No score yet</span>
            )}
          </div>
          <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-200">
            {row.score !== undefined && row.band ? (
              <div className={`h-full rounded-full ${BAND_BAR[row.band]}`} style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }} />
            ) : null}
            <div className="absolute top-0 h-full w-px bg-primary-600/70" style={{ left: `${target}%` }} aria-hidden />
          </div>
        </div>
      ))}
    </div>
  );
}
