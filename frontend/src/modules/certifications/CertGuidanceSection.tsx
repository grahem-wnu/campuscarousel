import { useRef, useState } from 'react';
import { Button, Icon, Spinner, safeHref } from '../../shared/ui';
import { getCertGuidance, startCertGuidance } from './api';
import { costLabel } from './logic';
import type { CertGuidanceResult } from './types';

const POLL_MS = 3000;
const MAX_POLLS = 40; // ~2 min — web-grounded research runs on the 300s worker but is usually <60s

/** "How & where to get this certification" — kicks off an async, web-grounded research job and polls
 *  until it settles, then renders the official link, the path to obtain it, and (when the student's
 *  location is known) specific nearby providers. Self-contained: drop it under a suggestion or a
 *  tracked cert. Caches the result in local state so re-opening the section doesn't re-research. */
export function CertGuidanceSection({ certName }: { certName: string }) {
  const [result, setResult] = useState<CertGuidanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  async function research(): Promise<void> {
    setLoading(true);
    setError(null);
    aliveRef.current = true;
    try {
      const job = await startCertGuidance(certName);
      let current = job;
      for (let i = 0; current.status === 'pending' && i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!aliveRef.current) return;
        current = await getCertGuidance(job.jobId);
      }
      if (current.status === 'failed') {
        setError('Could not research this one right now. Please try again in a moment.');
        return;
      }
      if (current.status === 'pending') {
        setError('Research is taking longer than expected — please try again in a moment.');
        return;
      }
      setResult(current.result ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not research this certification.');
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }

  if (!result) {
    return (
      <div className="rounded-md bg-surface-sunken p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-ink-600">
            <Icon name="search" size={15} className="text-primary-600" />
            <span>How &amp; where to get this</span>
          </div>
          <Button size="sm" variant="outline" loading={loading} onClick={() => void research()}>
            {loading ? 'Researching…' : 'Find how to get it'}
          </Button>
        </div>
        {loading ? (
          <p className="mt-2 text-xs text-ink-500">
            Looking up the official source and providers near you — this can take up to a minute.
          </p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-error-600">{error}</p> : null}
      </div>
    );
  }

  const { officialUrl, howToGet, prerequisites, typicalCost, renewalFrequency, localProviders } = result;
  const empty =
    !officialUrl && !howToGet && !prerequisites && typicalCost === undefined && !renewalFrequency &&
    !(localProviders && localProviders.length);

  return (
    <div className="space-y-2 rounded-md bg-surface-sunken p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-ink-700">
        <Icon name="search" size={15} className="text-primary-600" />
        How &amp; where to get this
      </div>

      {empty ? (
        <p className="text-ink-500">
          We couldn’t find detailed guidance right now. Try the issuer’s website, or{' '}
          <a
            className="text-primary-600 hover:text-primary-700"
            href={`https://www.google.com/search?q=${encodeURIComponent(`how to get ${certName} near me`)}`}
            target="_blank"
            rel="noreferrer"
          >
            search “{certName} near me”
          </a>
          .
        </p>
      ) : (
        <>
          {howToGet ? <p className="text-ink-700">{howToGet}</p> : null}
          {prerequisites ? (
            <p className="text-ink-600">
              <span className="font-medium text-ink-700">Prerequisites: </span>
              {prerequisites}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
            {typicalCost !== undefined ? <span>{costLabel(typicalCost)}</span> : null}
            {renewalFrequency ? <span>{renewalFrequency}</span> : null}
            {safeHref(officialUrl) ? (
              <a
                className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700"
                href={safeHref(officialUrl)}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="application" size={13} />
                Official site
              </a>
            ) : null}
          </div>

          {localProviders && localProviders.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-ink-600">Near you</p>
              <ul className="mt-1 space-y-1">
                {localProviders.map((p) => (
                  <li key={p.name} className="text-ink-700">
                    {safeHref(p.url) ? (
                      <a className="text-primary-600 hover:text-primary-700" href={safeHref(p.url)} target="_blank" rel="noreferrer">
                        {p.name}
                      </a>
                    ) : (
                      <span>{p.name}</span>
                    )}
                    {p.detail ? <span className="text-ink-500"> — {p.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
