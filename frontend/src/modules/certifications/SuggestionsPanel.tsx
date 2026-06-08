import { Button, Card, Icon, Spinner } from '../../shared/ui';
import { costLabel } from './logic';
import type { CertSuggestion } from './types';

interface Props {
  suggestions: CertSuggestion[];
  loading: boolean;
  careerGoal?: string;
  onAdd: (s: CertSuggestion) => void;
  onDismiss: () => void;
}

/** AI-suggested certs (curated baseline + career-goal track). Each is optional — the user adds the
 *  ones they want. Shown on first visit (empty list) and on demand. */
export function SuggestionsPanel({ suggestions, loading, careerGoal, onAdd, onDismiss }: Props) {
  return (
    <Card className="border border-primary-200 bg-primary-50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="star" size={18} className="text-primary-600" />
          <div>
            <h2 className="text-sm font-semibold text-primary-800">Suggested certifications</h2>
            {careerGoal ? (
              <p className="text-xs text-primary-700">Tailored to: {careerGoal}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-primary-600 hover:text-primary-800"
          aria-label="Dismiss suggestions"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : suggestions.length === 0 ? (
        <p className="py-4 text-center text-sm text-primary-700">
          You’re already tracking the certifications we’d suggest. Nice work.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {suggestions.map((s) => (
            <li
              key={s.name}
              className="flex items-start justify-between gap-3 rounded-md bg-surface-raised p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{s.name}</p>
                {s.issuingOrganization ? (
                  <p className="text-xs text-ink-500">{s.issuingOrganization}</p>
                ) : null}
                <p className="mt-1 text-sm text-ink-600">{s.why}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-500">
                  {s.typicalCost !== undefined ? <span>{costLabel(s.typicalCost)}</span> : null}
                  {s.renewalFrequency ? <span>{s.renewalFrequency}</span> : null}
                </div>
              </div>
              <Button size="sm" variant="outline" icon="plus" onClick={() => onAdd(s)}>
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
