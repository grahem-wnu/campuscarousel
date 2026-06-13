import { Badge, Button, Card, Icon, safeHref } from '../../shared/ui';
import { STATUS_META, countdownLabel, costLabel } from './logic';
import type { Certification } from './types';

interface Props {
  cert: Certification;
  onEdit: (cert: Certification) => void;
  onRenew: (cert: Certification) => void;
}

/** A single certification: name, issuer, status badge, expiration countdown, training progress,
 *  and a one-click renew action for certs that are expiring or expired. */
export function CertificationCard({ cert, onEdit, onRenew }: Props) {
  const meta = STATUS_META[cert.effectiveStatus];
  const showRenew =
    (cert.effectiveStatus === 'expiring-soon' || cert.effectiveStatus === 'expired') &&
    (cert.renewalRequired ?? true);

  return (
    <Card interactive className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon name="certificate" size={18} className="shrink-0 text-primary-600" />
            <h3 className="truncate text-base font-semibold text-ink-900">{cert.name}</h3>
          </div>
          {cert.issuingOrganization ? (
            <p className="mt-0.5 truncate text-sm text-ink-500">{cert.issuingOrganization}</p>
          ) : null}
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
        <span
          className={
            cert.effectiveStatus === 'expired'
              ? 'font-medium text-error-600'
              : cert.effectiveStatus === 'expiring-soon'
                ? 'font-medium text-warn-700'
                : ''
          }
        >
          {countdownLabel(cert.daysUntilExpiration)}
        </span>
        {cert.certificationNumber ? <span>#{cert.certificationNumber}</span> : null}
        {cert.cost !== undefined ? <span>{costLabel(cert.cost)}</span> : null}
      </div>

      {cert.effectiveStatus === 'in-progress' && cert.trainingProgram ? (
        <div className="flex items-center justify-between rounded-md bg-surface-sunken p-2.5 text-xs text-ink-600">
          <span className="truncate">{cert.trainingProgram}</span>
          {cert.trainingHours !== undefined ? (
            <span className="shrink-0">{cert.trainingHours}h logged</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={() => onEdit(cert)}>
          Edit
        </Button>
        {showRenew ? (
          <Button size="sm" variant="outline" onClick={() => onRenew(cert)}>
            Renew
          </Button>
        ) : null}
        {safeHref(cert.documentUrl) ? (
          <a
            href={safeHref(cert.documentUrl)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <Icon name="application" size={14} />
            Certificate
          </a>
        ) : null}
      </div>
    </Card>
  );
}
