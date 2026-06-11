import { Badge, Modal } from '../../shared/ui';
import { CollegeLogo } from './CollegeLogo';
import { PROGRAM_TYPE_LABEL, STATUS_META, bestCost, costLabel } from './logic';
import type { College } from './types';

interface Props {
  colleges: College[];
  open: boolean;
  onClose: () => void;
}

interface Row {
  label: string;
  value: (c: College) => string;
}

const ROWS: Row[] = [
  { label: 'Program', value: (c) => (c.programType ? PROGRAM_TYPE_LABEL[c.programType] : '—') },
  { label: 'Direct admit', value: (c) => (c.isDirectAdmit ? 'Yes' : c.isDirectAdmit === false ? 'No' : '—') },
  { label: 'Ranking', value: (c) => c.ranking ?? '—' },
  { label: 'Net cost / yr', value: (c) => (bestCost(c) !== undefined ? costLabel(bestCost(c)) : '—') },
  { label: 'Acceptance (program)', value: (c) => c.acceptanceRateProgram ?? '—' },
  { label: 'Avg GPA', value: (c) => c.avgGPAAdmitted ?? '—' },
  { label: 'Fit score', value: (c) => (c.fitScore !== undefined ? String(c.fitScore) : '—') },
];

/** Side-by-side comparison of 2–4 colleges, with a 4-year budget-impact footer. */
export function CompareView({ colleges, open, onClose }: Props) {
  const totalFourYear = (c: College): number | undefined => {
    const annual = bestCost(c);
    return annual !== undefined ? annual * 4 : undefined;
  };

  return (
    <Modal open={open} onClose={onClose} title={`Compare ${colleges.length} colleges`} size="lg">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-36 p-2 text-left text-ink-500" />
              {colleges.map((c) => (
                <th key={c.collegeId} className="min-w-[10rem] p-2 text-left align-bottom">
                  <div className="flex items-center gap-2">
                    <CollegeLogo college={c} size={28} />
                    <span className="font-semibold text-ink-900">{c.name}</span>
                  </div>
                  <div className="mt-1">
                    <Badge tone={STATUS_META[c.status ?? 'researching'].tone}>
                      {STATUS_META[c.status ?? 'researching'].label}
                    </Badge>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-surface-border">
                <td className="p-2 font-medium text-ink-600">{row.label}</td>
                {colleges.map((c) => (
                  <td key={c.collegeId} className="p-2 text-ink-800">
                    {row.value(c)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 border-surface-border bg-surface-sunken">
              <td className="p-2 font-semibold text-ink-700">Est. 4-year cost</td>
              {colleges.map((c) => {
                const total = totalFourYear(c);
                return (
                  <td key={c.collegeId} className="p-2 font-semibold text-ink-900">
                    {total !== undefined ? costLabel(total) : '—'}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
