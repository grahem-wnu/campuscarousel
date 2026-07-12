import { useState } from 'react';
import { Badge, Button, Card, Icon, safeHref } from '../../shared/ui';
import { CertForm } from './CertForm';
import { CertGuidanceSection } from './CertGuidanceSection';
import { STATUS_META, countdownLabel, costLabel } from './logic';
import type { Certification, CertificationInput } from './types';

interface Props {
  cert: Certification;
  /** Expansion is controlled by the page (so the "expiring" list can open a specific card). */
  expanded: boolean;
  onToggle: () => void;
  /** Persist an edit. Resolves on success; rejects with a message the card surfaces inline. */
  onSave: (certId: string, input: CertificationInput) => Promise<void>;
  onDelete: (certId: string) => Promise<void>;
}

/** One certification. Collapsed: name, issuer, status, expiration countdown. Click the header to
 *  expand in place — full details, the inline edit form, and "how & where to get it" guidance.
 *  No modal: editing happens right inside the card. */
export function CertificationCard({ cert, expanded, onToggle, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = STATUS_META[cert.effectiveStatus];
  const showRenew =
    (cert.effectiveStatus === 'expiring-soon' || cert.effectiveStatus === 'expired') &&
    (cert.renewalRequired ?? true);

  function toggle(): void {
    onToggle();
    setEditing(false);
    setError(null);
  }

  async function save(input: CertificationInput): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await onSave(cert.certId, input);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Check the fields and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await onDelete(cert.certId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this certification.');
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      {/* Header — clickable to expand/collapse. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon name="certificate" size={18} className="shrink-0 text-primary-600" />
            <h3 className="truncate text-base font-semibold text-ink-900">{cert.name}</h3>
          </div>
          {cert.issuingOrganization ? (
            <p className="mt-0.5 truncate text-sm text-ink-500">{cert.issuingOrganization}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={16} className="text-ink-400" />
        </div>
      </button>

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

      {expanded ? (
        editing ? (
          <div className="border-t border-surface-border pt-3">
            <CertForm
              initial={cert}
              busy={busy}
              error={error}
              onSubmit={(input) => void save(input)}
              onCancel={() => {
                setEditing(false);
                setError(null);
              }}
              onDelete={() => void remove()}
            />
          </div>
        ) : (
          <div className="space-y-3 border-t border-surface-border pt-3">
            <dl className="grid grid-cols-1 gap-y-1.5 text-sm">
              {cert.dateEarned ? <Row label="Earned" value={cert.dateEarned} /> : null}
              {cert.expirationDate ? <Row label="Expires" value={cert.expirationDate} /> : null}
              {cert.renewalFrequency ? <Row label="Renews" value={cert.renewalFrequency} /> : null}
              {cert.cost !== undefined ? <Row label="Cost" value={costLabel(cert.cost)} /> : null}
            </dl>
            {cert.renewalRequirements ? (
              <p className="text-sm text-ink-600">
                <span className="font-medium text-ink-700">Renewal: </span>
                {cert.renewalRequirements}
              </p>
            ) : null}
            {cert.notes ? <p className="text-sm text-ink-600">{cert.notes}</p> : null}

            <CertGuidanceSection certName={cert.name} />

            {error ? <p className="text-sm text-error-600">{error}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={showRenew ? 'outline' : 'ghost'} onClick={() => setEditing(true)}>
                {showRenew ? 'Renew' : 'Edit'}
              </Button>
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
          </div>
        )
      ) : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-ink-800">{value}</dd>
    </div>
  );
}
