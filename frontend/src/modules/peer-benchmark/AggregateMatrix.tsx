import { Badge, Icon, Table, type Column } from '../../shared/ui';
import { cellText, readinessMeta, statusMeta } from './logic';
import { DEFAULT_BENCHMARK_LABELS, type BenchmarkLabels, type MatrixRow } from './types';

/** A color-coded matrix cell: "keira / school" tinted by Keira's standing on that metric. */
function Cell({ keira, school, status, gpa }: { keira?: number; school?: number; status?: 'above' | 'at' | 'below' | 'not-taken'; gpa?: boolean }) {
  const meta = statusMeta(status);
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs tabular-nums ${meta.cell}`}>
      {cellText(keira, school, gpa)}
    </span>
  );
}

/**
 * The aggregate matrix: every college × the competitive metrics, with Keira's stats compared and
 * color-coded (green exceeds / yellow meets / red below / gray no data). Top picks are flagged.
 */
export function AggregateMatrix({
  rows,
  keira,
  labels = DEFAULT_BENCHMARK_LABELS,
  onSelect,
}: {
  rows: MatrixRow[];
  keira: { gpa?: number; teasScore?: number; clinicalHours: number; volunteerHours: number };
  labels?: BenchmarkLabels;
  onSelect?: (collegeId: string) => void;
}) {
  const columns: (Column<MatrixRow> | null)[] = [
    {
      key: 'college',
      header: 'College',
      render: (r) => (
        <span className="flex items-center gap-1.5 font-medium text-ink-800">
          {r.isTopPick ? <Icon name="star" size={14} filled /> : null}
          {r.collegeName}
        </span>
      ),
    },
    {
      key: 'gpa',
      header: 'GPA',
      align: 'center',
      render: (r) => <Cell keira={keira.gpa} school={r.benchmark.avgGPAAdmitted} status={r.comparison.gpaStatus} gpa />,
    },
    // Entrance-exam column only when the major has one (hidden for e.g. construction management).
    labels.exam
      ? {
          key: 'teas',
          header: labels.exam,
          align: 'center',
          render: (r) => <Cell keira={keira.teasScore} school={r.benchmark.avgTEASScore} status={r.comparison.teasStatus} />,
        }
      : null,
    {
      key: 'clinical',
      header: labels.experience,
      align: 'center',
      render: (r) => (
        <Cell keira={keira.clinicalHours} school={r.benchmark.typicalClinicalHours} status={r.comparison.clinicalHoursStatus} />
      ),
    },
    {
      key: 'volunteer',
      header: 'Volunteer h',
      align: 'center',
      render: (r) => (
        <Cell keira={keira.volunteerHours} school={r.benchmark.typicalVolunteerHours} status={r.comparison.volunteerHoursStatus} />
      ),
    },
    {
      key: 'readiness',
      header: 'Readiness',
      align: 'center',
      render: (r) => {
        const m = readinessMeta(r.comparison.overallReadiness);
        return <Badge tone={m.tone}>{m.label}</Badge>;
      },
    },
  ];

  return (
    <Table
      columns={columns.filter((c): c is Column<MatrixRow> => c !== null)}
      rows={rows}
      rowKey={(r) => r.collegeId}
      onRowClick={onSelect ? (r) => onSelect(r.collegeId) : undefined}
      empty="No colleges to compare yet."
    />
  );
}
