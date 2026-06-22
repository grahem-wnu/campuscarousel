import { overallSeries, polylinePoints, targetY, type ChartGeom } from './logic';
import { pctOfMax, type ExamDef } from './exams';
import type { ProgressPoint } from './types';

interface Props {
  progression: ProgressPoint[];
  exam: ExamDef;
  /** Strong-score line, as a percentage of the exam's max (default 78%). */
  target?: number;
}

const GEOM: ChartGeom = { width: 320, height: 140, pad: 12 };

/** Lightweight dependency-free SVG line chart of overall-score progression. Scores are normalized to
 *  a percentage of the exam's max so any exam (SAT 1600, ACT 36, TEAS 100) charts on one axis. */
export function ScoreChart({ progression, exam, target = 78 }: Props) {
  const max = exam.overall.max;
  const series = overallSeries(progression).map((s) => (typeof s === 'number' ? pctOfMax(s, max) : undefined));
  const points = polylinePoints(series, GEOM);
  const ty = targetY(target, GEOM);
  const scored = series
    .map((s, i) => ({ s, i }))
    .filter((p): p is { s: number; i: number } => typeof p.s === 'number');
  const stepX = series.length > 1 ? (GEOM.width - GEOM.pad * 2) / (series.length - 1) : 0;

  return (
    <svg
      viewBox={`0 0 ${GEOM.width} ${GEOM.height}`}
      className="h-40 w-full"
      role="img"
      aria-label={`${exam.label} overall score progression`}
    >
      {/* strong-score line */}
      <line x1={GEOM.pad} y1={ty} x2={GEOM.width - GEOM.pad} y2={ty} stroke="#15868a" strokeDasharray="4 3" strokeWidth={1} />
      <text x={GEOM.width - GEOM.pad} y={ty - 3} textAnchor="end" className="fill-primary-600 text-[9px]">
        strong ≥ {target}%
      </text>
      {/* progression line */}
      {points ? <polyline points={points} fill="none" stroke="#d86f2c" strokeWidth={2} /> : null}
      {/* points */}
      {scored.map(({ s, i }) => {
        const x = GEOM.pad + i * stepX;
        const y = GEOM.pad + (GEOM.height - GEOM.pad * 2) * (1 - s / 100);
        return <circle key={i} cx={x} cy={y} r={3} className="fill-secondary-500" />;
      })}
    </svg>
  );
}
