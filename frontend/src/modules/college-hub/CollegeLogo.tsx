import { useEffect, useState } from 'react';
import { Icon } from '../../shared/ui';
import { logoCandidates } from './logic';
import type { College } from './types';

interface Props {
  college: College;
  size?: number;
  className?: string;
}

/** College logo with a best-effort fallback chain: branding/cached URL → Clearbit (root domain) →
 *  graduation-cap. Advances through the candidates on each <img> load error, so a broken or
 *  hotlink-blocked logo quietly tries the next source rather than showing as broken. */
export function CollegeLogo({ college, size = 40, className }: Props) {
  const candidates = logoCandidates(college);
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [college.collegeId]); // restart the chain when the college changes
  const src = candidates[idx];

  const box = `inline-flex items-center justify-center overflow-hidden rounded-lg bg-surface-sunken ${className ?? ''}`;
  if (!src) {
    return (
      <span className={box} style={{ width: size, height: size }} aria-hidden>
        <Icon name="school" size={Math.round(size * 0.55)} className="text-ink-400" />
      </span>
    );
  }
  return (
    <span className={box} style={{ width: size, height: size }}>
      <img
        src={src}
        alt={`${college.name} logo`}
        width={size}
        height={size}
        className="h-full w-full object-contain"
        onError={() => setIdx((i) => i + 1)}
      />
    </span>
  );
}
