import { Card, Icon } from '../../shared/ui';
import { countdownLabel } from './logic';
import type { Certification } from './types';

interface Props {
  expiring: Certification[];
  onSelect: (cert: Certification) => void;
}

/** Expiration alerts: certs expiring within 90 days (the spec's horizon). Hidden when empty so it
 *  never adds noise on a healthy page. */
export function ExpiringWidget({ expiring, onSelect }: Props) {
  if (expiring.length === 0) return null;

  return (
    <Card className="border border-warn-200 bg-warn-50">
      <div className="flex items-center gap-2">
        <Icon name="warning" size={18} className="text-warn-700" />
        <h2 className="text-sm font-semibold text-warn-800">
          {expiring.length} certification{expiring.length === 1 ? '' : 's'} expiring soon
        </h2>
      </div>
      <ul className="mt-2 divide-y divide-warn-200">
        {expiring.map((cert) => (
          <li key={cert.certId}>
            <button
              type="button"
              onClick={() => onSelect(cert)}
              className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:text-warn-900"
            >
              <span className="truncate font-medium text-ink-800">{cert.name}</span>
              <span className="shrink-0 text-warn-700">{countdownLabel(cert.daysUntilExpiration)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
