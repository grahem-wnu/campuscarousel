import { useEffect, useState } from 'react';
import { Icon } from '../../shared/ui';
import { logoSrc } from './logic';
import type { College } from './types';

interface Props {
  college: College;
  size?: number;
  className?: string;
}

/** College logo with the spec's fallback chain: branding URL → Clearbit hotlink → graduation-cap.
 *  Swaps to the cap on an <img> load error (broken/hotlink-blocked logos never show as broken). */
export function CollegeLogo({ college, size = 40, className }: Props) {
  const src = logoSrc(college);
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [src]); // reset when the college (src) changes

  const box = `inline-flex items-center justify-center overflow-hidden rounded-lg bg-surface-sunken ${className ?? ''}`;
  if (!src || errored) {
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
        onError={() => setErrored(true)}
      />
    </span>
  );
}
