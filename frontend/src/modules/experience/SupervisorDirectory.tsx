import { Badge, Card, EmptyState, Table, type Column } from '../../shared/ui';
import { formatHours } from './logic';
import type { SupervisorEntry } from './types';

const columns: Column<SupervisorEntry>[] = [
  {
    key: 'name',
    header: 'Supervisor',
    render: (s) => (
      <div>
        <div className="font-medium text-ink-900">{s.name}</div>
        {s.title ? <div className="text-xs text-ink-500">{s.title}</div> : null}
      </div>
    ),
  },
  { key: 'contact', header: 'Contact', render: (s) => s.contact ?? <span className="text-ink-400">—</span> },
  { key: 'facilities', header: 'Facilities', render: (s) => s.facilities.join(', ') },
  { key: 'hours', header: 'Hours', align: 'right', render: (s) => formatHours(s.totalHours) },
  {
    key: 'recommender',
    header: '',
    render: (s) =>
      // A supervisor with substantial hours is a natural recommender candidate; flag it so Keira
      // remembers who to ask. Threshold is a UI heuristic, not a data field.
      s.totalHours >= 20 ? <Badge tone="success">Recommender?</Badge> : null,
  },
];

/** Auto-built directory of every supervisor named on a (visibility-filtered) clinical entry. */
export function SupervisorDirectory({ supervisors }: { supervisors: SupervisorEntry[] }) {
  if (supervisors.length === 0) {
    return (
      <EmptyState
        icon="contacts"
        title="No supervisors yet"
        description="Name a supervisor when you log clinical hours and they'll appear here — handy when it's time to line up recommenders."
      />
    );
  }
  return (
    <Card flush>
      <Table columns={columns} rows={supervisors} rowKey={(s) => s.name} />
    </Card>
  );
}
