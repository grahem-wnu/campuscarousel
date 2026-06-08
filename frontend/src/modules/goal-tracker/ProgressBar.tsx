import { cn } from '../../shared/ui';

interface ProgressBarProps {
  value: number; // 0-100
  /** Label suffix, e.g. "auto" when milestone-derived. */
  caption?: string;
  className?: string;
}

/** A slim progress bar with an accessible label. Used on the card and the detail view. */
export function ProgressBar({ value, caption, className }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-xs text-ink-500">
        <span>{pct}% complete</span>
        {caption ? <span className="text-ink-400">{caption}</span> : null}
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-success-500' : 'bg-primary-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
