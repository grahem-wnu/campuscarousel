// A status pill for a college's hydration state. When a refresh is in flight (pending/in-progress) it
// shows a small inline spinner alongside the label so it's obvious the college is being worked on.
// Renders nothing when the college is fully hydrated. Used by the card, table, and detail views.

import { Badge, Spinner } from "../../shared/ui";
import { hydrationMeta } from "./logic";
import type { College } from "./types";

export function HydrationBadge({ status }: { status: College["hydrationStatus"] }) {
  const hyd = hydrationMeta(status);
  if (!hyd) return null;
  return (
    <Badge tone={hyd.tone}>
      <span className="inline-flex items-center gap-1">
        {hyd.busy ? <Spinner size={11} /> : null}
        {hyd.label}
      </span>
    </Badge>
  );
}
