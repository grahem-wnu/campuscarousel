import { Badge, Card, Icon } from '../../shared/ui';
import { STATUS_META, TYPE_META, deadlineInfo, formatAmount } from './logic';
import type { Scholarship } from './types';

interface Props {
  scholarship: Scholarship;
  today: string;
  onOpen: (s: Scholarship) => void;
}

/** Compact scholarship card with a color-coded deadline. Click opens the detail. */
export function ScholarshipCard({ scholarship: s, today, onOpen }: Props) {
  const dl = deadlineInfo(s.applicationDeadline, today);
  return (
    <Card
      interactive
      flush
      role="button"
      tabIndex={0}
      className="cursor-pointer space-y-2 p-3"
      onClick={() => onOpen(s)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(s);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink-900">{s.name}</h3>
          {s.provider ? <p className="truncate text-xs text-ink-500">{s.provider}</p> : null}
        </div>
        <span className="shrink-0 text-sm font-semibold text-ink-800">
          {formatAmount(s.amount, s.amountDescription)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {s.status ? <Badge tone={STATUS_META[s.status].tone}>{STATUS_META[s.status].label}</Badge> : null}
        {s.type ? <Badge tone="neutral">{TYPE_META[s.type]}</Badge> : null}
        <Badge tone={dl.tone}>
          <Icon name="calendar" size={11} />
          <span className="ml-1">{dl.label}</span>
        </Badge>
        {s.addedBy === 'ai-discovered' ? (
          <Badge tone="info">
            <Icon name="star" size={11} />
            <span className="ml-1">AI</span>
          </Badge>
        ) : null}
      </div>
    </Card>
  );
}
