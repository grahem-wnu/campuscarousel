import { Badge, Button, Card, Icon } from '../../shared/ui';
import { CollegeLogo } from './CollegeLogo';
import {
  PROGRAM_TYPE_LABEL,
  STATUS_META,
  bestCost,
  costLabel,
  fitBand,
  hydrationMeta,
} from './logic';
import type { College } from './types';

interface Props {
  college: College;
  selectedForCompare?: boolean;
  onOpen: (c: College) => void;
  onToggleTopPick: (c: College) => void;
  onToggleCompare?: (c: College) => void;
}

/** A college tile: logo, name, program-type badge, status, top-pick star, hydration indicator,
 *  cost + fit. Click opens the detail view. */
export function CollegeCard({ college, selectedForCompare, onOpen, onToggleTopPick, onToggleCompare }: Props) {
  const status = STATUS_META[college.status ?? 'researching'];
  const hyd = hydrationMeta(college.hydrationStatus);
  const fit = fitBand(college.fitScore);
  const cost = bestCost(college);

  return (
    <Card interactive className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <CollegeLogo college={college} size={44} />
        <button type="button" onClick={() => onOpen(college)} className="min-w-0 flex-1 text-left">
          <h3 className="truncate text-base font-semibold text-ink-900">{college.name}</h3>
          <p className="truncate text-sm text-ink-500">
            {[college.location ?? college.state, college.ranking].filter(Boolean).join(' · ') || '—'}
          </p>
        </button>
        <button
          type="button"
          aria-label={college.isTopPick ? 'Remove top pick' : 'Mark top pick'}
          onClick={() => onToggleTopPick(college)}
          className={college.isTopPick ? 'text-warn-500' : 'text-ink-300 hover:text-warn-400'}
        >
          <Icon name="star" size={20} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={status.tone}>{status.label}</Badge>
        {college.programType ? <Badge tone="neutral">{PROGRAM_TYPE_LABEL[college.programType]}</Badge> : null}
        {fit ? <Badge tone={fit.tone}>{fit.label}</Badge> : null}
        {hyd ? <Badge tone={hyd.tone}>{hyd.label}</Badge> : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-sm text-ink-600">
        <span>{cost !== undefined ? `${costLabel(cost)}/yr` : 'Cost TBD'}</span>
        {onToggleCompare ? (
          <Button
            size="sm"
            variant={selectedForCompare ? 'secondary' : 'ghost'}
            onClick={() => onToggleCompare(college)}
          >
            {selectedForCompare ? 'Comparing' : 'Compare'}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
