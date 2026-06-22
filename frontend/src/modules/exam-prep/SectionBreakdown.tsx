import { Badge } from '../../shared/ui';
import { BAND_BAR, BAND_TONE, bandOf } from './logic';
import { pctOfMax, type ExamDef } from './exams';
import type { ProgressPoint } from './types';

interface Props {
  progression: ProgressPoint[];
  exam: ExamDef;
  /** Strong-score marker, as a percentage of each section's max (default 78%). */
  target?: number;
}

/** Per-section breakdown of the latest attempt for the active exam. The badge shows the raw score
 *  (e.g. 650 / 27 / 85%); the bar fills to that score's percentage of the section max so red/yellow/
 *  green color-coding is comparable across exams with different scales. */
export function SectionBreakdown({ progression, exam, target = 78 }: Props) {
  const latest = progression.at(-1)?.sectionScores;
  const rows = exam.sections.map((sec) => {
    const score = latest?.[sec.key];
    const pct = score !== undefined ? pctOfMax(score, sec.max) : undefined;
    return { ...sec, score, pct, band: pct !== undefined ? bandOf(pct) : undefined };
  });
  if (!rows.length || rows.every((r) => r.score === undefined)) return null;

  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-700">{row.label}</span>
            {row.score !== undefined && row.band ? (
              <Badge tone={BAND_TONE[row.band]}>{row.score} / {row.max}</Badge>
            ) : (
              <span className="text-xs text-ink-400">No score yet</span>
            )}
          </div>
          <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-200">
            {row.pct !== undefined && row.band ? (
              <div className={`h-full rounded-full ${BAND_BAR[row.band]}`} style={{ width: `${row.pct}%` }} />
            ) : null}
            <div className="absolute top-0 h-full w-px bg-primary-600/70" style={{ left: `${target}%` }} aria-hidden />
          </div>
        </div>
      ))}
    </div>
  );
}
