// A small pill showing a college's EFFECTIVE admissions bucket (reach/target/safety). Colored from
// the Field Notes palette via the shared Badge tones — reach=amber (warn), target=evergreen
// (primary), safety=ink/muted (neutral). A subtle "set by you" dot appears only when the family has
// overridden the AI's pick. Renders nothing when there's no bucket (unless `showUnclassified`).

import { Badge } from '../../shared/ui';
import { BUCKET_LABEL, BUCKET_TONE, effectiveBucket, isOverridden } from './logic';
import type { AdmissionBucket } from './types';

interface Props {
  college: { bucket?: AdmissionBucket; suggestedBucket?: AdmissionBucket };
  /** When true and there is no effective bucket, render a muted "Unclassified" pill instead of nothing. */
  showUnclassified?: boolean;
  className?: string;
}

/** Effective-bucket pill. See file header for color mapping + override affordance. */
export function BucketBadge({ college, showUnclassified, className }: Props) {
  const bucket = effectiveBucket(college);
  if (!bucket) {
    if (!showUnclassified) return null;
    return (
      <Badge tone="neutral" className={className}>
        Unclassified
      </Badge>
    );
  }
  const overridden = isOverridden(college);
  return (
    <Badge tone={BUCKET_TONE[bucket]} className={className}>
      {BUCKET_LABEL[bucket]}
      {overridden ? (
        <span
          aria-label="Bucket set by you"
          title="Set by you"
          className="h-1.5 w-1.5 rounded-full bg-current opacity-60"
        />
      ) : null}
    </Badge>
  );
}
