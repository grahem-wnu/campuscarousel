// Click-to-edit admissions-bucket control. The trigger is the college's BucketBadge; clicking it
// opens a small controlled popover with the three bucket choices, the AI's rationale as a hint, and a
// "use AI's pick" reset. Selecting persists via setBucket(id, choice); reset persists setBucket(id,
// null) (revert to the AI suggestion). The updated college flows back through onChanged so the parent
// can reconcile its list/state (mirrors how setTopPick callers update state).

import { useState } from 'react';
import { Icon, Spinner } from '../../shared/ui';
import { setBucket } from './api';
import { BUCKET_LABEL, BUCKET_ORDER, effectiveBucket, isOverridden } from './logic';
import { BucketBadge } from './BucketBadge';
import type { AdmissionBucket, College } from './types';

interface Props {
  college: College;
  /** Called with the server's updated college after a successful set/clear so the parent can reconcile. */
  onChanged?: (updated: College) => void;
  className?: string;
}

const TONE_DOT: Record<AdmissionBucket, string> = {
  reach: 'bg-warn-500',
  target: 'bg-primary-500',
  safety: 'bg-ink-400',
};

const CHECK_COLOR: Record<AdmissionBucket, string> = {
  reach: 'text-warn-600',
  target: 'text-primary-600',
  safety: 'text-ink-600',
};

/** Badge + click-out popover selector for a college's admissions bucket. */
export function BucketPicker({ college, onChanged, className }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = effectiveBucket(college);
  const overridden = isOverridden(college);

  async function choose(bucket: AdmissionBucket | null): Promise<void> {
    setSaving(true);
    try {
      const updated = await setBucket(college.collegeId, bucket);
      onChanged?.(updated);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`relative inline-flex ${className ?? ''}`}>
      <button
        type="button"
        aria-label="Set admissions bucket"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex items-center gap-1 rounded-full transition hover:opacity-80"
      >
        <BucketBadge college={college} showUnclassified />
        <Icon name="chevron-down" size={12} className="text-ink-400" />
      </button>

      {open ? (
        <>
          {/* Click-out backdrop. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-overlay cursor-default"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-full z-slideover mt-1 w-60 rounded-lg border border-surface-border bg-surface-raised p-2 shadow-lg"
          >
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              Admissions likelihood
            </p>
            <div className="flex flex-col">
              {BUCKET_ORDER.map((b) => {
                const active = current === b;
                const isSuggestion = !overridden && college.suggestedBucket === b;
                return (
                  <button
                    key={b}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    disabled={saving}
                    onClick={() => void choose(b)}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface-sunken ${
                      active ? 'font-semibold text-ink-900' : 'text-ink-700'
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[b]}`} />
                    <span className="flex-1">{BUCKET_LABEL[b]}</span>
                    {isSuggestion ? <span className="text-[10px] text-ink-400">AI pick</span> : null}
                    {active ? <Icon name="check" size={14} className={CHECK_COLOR[b]} /> : null}
                  </button>
                );
              })}
            </div>

            {college.suggestedBucketRationale ? (
              <p className="mt-1 border-t border-surface-border px-1 pt-2 text-xs text-ink-500">
                <span className="font-medium text-ink-600">AI: </span>
                {college.suggestedBucketRationale}
              </p>
            ) : null}

            {overridden && college.suggestedBucket ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void choose(null)}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-surface-border px-2 py-1.5 text-xs font-medium text-ink-600 transition hover:bg-surface-sunken"
              >
                {saving ? <Spinner size={12} /> : null}
                Use AI’s pick ({BUCKET_LABEL[college.suggestedBucket]})
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
