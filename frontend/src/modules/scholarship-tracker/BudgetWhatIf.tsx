import { useState } from 'react';
import { Card, Field, Input } from '../../shared/ui';
import { formatAmount, whatIf } from './logic';
import type { ScholarshipSummary } from './types';

/** "What-if" affordability: shows budget − awarded = adjusted, and lets the user model an extra
 *  hypothetical award to see the impact on out-of-pocket cost. */
export function BudgetWhatIf({ summary }: { summary: ScholarshipSummary }) {
  const [extra, setExtra] = useState('');
  const extraNum = Number(extra) || 0;
  const { adjustedNow, adjustedWithHypothetical, covered } = whatIf(
    summary.budget.totalBudget,
    summary.totalAwarded,
    extraNum,
  );

  if (summary.budget.totalBudget === null) {
    return (
      <Card className="text-sm text-ink-500">
        Set a total budget (in the budget module) to model scholarship impact on out-of-pocket cost.
      </Card>
    );
  }

  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-ink-600">{label}</span>
      <span className={strong ? 'text-base font-semibold text-ink-900' : 'text-sm text-ink-800'}>{value}</span>
    </div>
  );

  return (
    <Card className="space-y-1">
      <h3 className="text-sm font-semibold text-ink-800">What-if affordability</h3>
      {row('Total budget', formatAmount(summary.budget.totalBudget))}
      {row('Awarded so far', `– ${formatAmount(summary.totalAwarded)}`)}
      {row('Out-of-pocket now', formatAmount(adjustedNow ?? undefined), true)}
      <div className="border-t border-ink-200 pt-2">
        <Field label="If you also won…" hint="A hypothetical extra award">
          <Input type="number" min={0} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="10000" />
        </Field>
      </div>
      {extraNum > 0 ? (
        <>
          {row('Total covered', formatAmount(covered))}
          {row('Out-of-pocket then', formatAmount(adjustedWithHypothetical ?? undefined), true)}
        </>
      ) : null}
    </Card>
  );
}
