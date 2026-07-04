import { useEffect, useState } from 'react';
import { Badge, Button, Card } from '../../shared/ui';
import { CollegeLogo } from './CollegeLogo';
import {
  PROGRAM_TYPE_LABEL,
  STATUS_META,
  bestCost,
  campusImageSrc,
  costLabel,
  fitBand,
} from './logic';
import { HydrationBadge } from './HydrationBadge';
import type { College } from './types';

interface Props {
  college: College;
  selectedForCompare?: boolean;
  onOpen: (c: College) => void;
  onToggleTopPick: (c: College) => void;
  onToggleCompare?: (c: College) => void;
}

/** A college tile. When a campus photo has been fetched it leads with a welcoming hero banner (logo
 *  chip + name over the photo); otherwise it falls back to the logo-led header. Either way it shows
 *  program-type, status, top-pick, hydration indicator, cost + fit. Top picks carry a clear labeled
 *  badge + an accent ring + a labeled toggle (not just a star). Click opens the detail view. */
export function CollegeCard({ college, selectedForCompare, onOpen, onToggleTopPick, onToggleCompare }: Props) {
  const status = STATUS_META[college.status ?? 'researching'];
  const fit = fitBand(college.fitScore);
  const cost = bestCost(college);
  const subtitle = [college.location ?? college.state, college.ranking].filter(Boolean).join(' · ') || '—';

  // Lead with the campus photo when we have one; swap back to the logo-led header on a load error.
  const campus = campusImageSrc(college);
  const [campusErrored, setCampusErrored] = useState(false);
  useEffect(() => setCampusErrored(false), [campus]);
  const hero = campus && !campusErrored;

  return (
    <Card
      flush
      interactive
      className={`flex flex-col overflow-hidden${college.isTopPick ? ' ring-2 ring-warn-300' : ''}`}
    >
      {hero ? (
        <div className="relative h-28 w-full bg-surface-sunken">
          <img
            src={campus ?? undefined}
            alt={`${college.name} campus`}
            title={college.campusImageCredit}
            className="h-full w-full object-cover"
            onError={() => setCampusErrored(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-2 p-3">
            <CollegeLogo college={college} size={36} className="shrink-0 bg-white ring-1 ring-white/70" />
            <button type="button" onClick={() => onOpen(college)} className="min-w-0 flex-1 text-left">
              <h3 className="truncate font-display text-base font-semibold text-white drop-shadow">{college.name}</h3>
              <p className="truncate text-xs text-white/85 drop-shadow">{subtitle}</p>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 border-b border-surface-border bg-primary-50/50 px-4 py-3">
          <CollegeLogo college={college} size={40} className="shrink-0" />
          <button type="button" onClick={() => onOpen(college)} className="min-w-0 flex-1 text-left">
            <h3 className="truncate font-display text-base font-semibold text-ink-900">{college.name}</h3>
            <p className="truncate text-xs text-ink-500">{subtitle}</p>
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-4">
        {hero && college.campusImageCredit ? (
          <p className="truncate text-[10px] text-ink-400" title={college.campusImageCredit}>
            {college.campusImageCredit}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {college.isTopPick ? <Badge tone="warn">★ Top pick</Badge> : null}
          <Badge tone={status.tone}>{status.label}</Badge>
          {college.programType ? <Badge tone="neutral">{PROGRAM_TYPE_LABEL[college.programType]}</Badge> : null}
          {fit ? <Badge tone={fit.tone}>{fit.label}</Badge> : null}
          <HydrationBadge status={college.hydrationStatus} />
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1 text-sm text-ink-600">
          <span>{cost !== undefined ? `${costLabel(cost)}/yr` : 'Cost TBD'}</span>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={college.isTopPick ? 'secondary' : 'ghost'}
              icon="star"
              onClick={() => onToggleTopPick(college)}
            >
              {college.isTopPick ? 'Top pick' : 'Mark top pick'}
            </Button>
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
        </div>
      </div>
    </Card>
  );
}
