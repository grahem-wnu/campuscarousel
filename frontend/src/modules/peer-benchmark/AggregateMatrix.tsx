import { Badge, Icon, Table, type Column } from '../../shared/ui';
import { cellText, readinessMeta, statusMeta } from './logic';
import type { MatrixRow } from './types';

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
  onSelect,
}: {
  rows: MatrixRow[];
  keira: { gpa?: number; teasScore?: number; clinicalHours: number; volunteerHours: number };
  onSelect?: (collegeId: string) => void;
}) {
  const columns: Column<MatrixRow>[] = [
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
    {
      key: 'teas',
      header: 'TEAS',
      align: 'center',
      render: (r) => <Cell keira={keira.teasScore} school={r.benchmark.avgTEASScore} status={r.comparison.teasStatus} />,
    },
    {
      key: 'clinical',
      header: 'Clinical h',
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
      columns={columns}
      rows={rows}
      rowKey={(r) => r.collegeId}
      onRowClick={onSelect ? (r) => onSelect(r.collegeId) : undefined}
      empty="No colleges to compare yet."
    />
  );
}
