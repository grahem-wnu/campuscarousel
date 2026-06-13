import { Badge, Icon } from '../../shared/ui';
import { CollegeLogo } from './CollegeLogo';
import { PROGRAM_TYPE_LABEL, STATUS_META, bestCost, costLabel } from './logic';
import { HydrationBadge } from './HydrationBadge';
import type { College } from './types';

interface Props {
  colleges: College[];
  onOpen: (c: College) => void;
  onToggleTopPick: (c: College) => void;
}

/** Dense table view of the college list (toggled from the card view). */
export function CollegeTable({ colleges, onOpen, onToggleTopPick }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-sunken text-left text-ink-500">
          <tr>
            <th className="p-2" />
            <th className="p-2 font-medium">College</th>
            <th className="p-2 font-medium">Status</th>
            <th className="p-2 font-medium">Program</th>
            <th className="p-2 font-medium">Net cost/yr</th>
            <th className="p-2 font-medium">Fit</th>
          </tr>
        </thead>
        <tbody>
          {colleges.map((c) => {
            const cost = bestCost(c);
            return (
              <tr key={c.collegeId} className="border-t border-surface-border hover:bg-surface-sunken">
                <td className="p-2">
                  <button
                    type="button"
                    aria-label={c.isTopPick ? 'Remove top pick' : 'Mark top pick'}
                    onClick={() => onToggleTopPick(c)}
                    className={c.isTopPick ? 'text-warn-500' : 'text-ink-300 hover:text-warn-400'}
                  >
                    <Icon name="star" size={16} />
                  </button>
                </td>
                <td className="p-2">
                  <button type="button" onClick={() => onOpen(c)} className="flex items-center gap-2 text-left">
                    <CollegeLogo college={c} size={24} />
                    <span className="font-medium text-ink-900">{c.name}</span>
                    <HydrationBadge status={c.hydrationStatus} />
                  </button>
                </td>
                <td className="p-2">
                  <Badge tone={STATUS_META[c.status ?? 'researching'].tone}>
                    {STATUS_META[c.status ?? 'researching'].label}
                  </Badge>
                </td>
                <td className="p-2 text-ink-700">{c.programType ? PROGRAM_TYPE_LABEL[c.programType] : '—'}</td>
                <td className="p-2 text-ink-700">{cost !== undefined ? costLabel(cost) : '—'}</td>
                <td className="p-2 text-ink-700">{c.fitScore ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
