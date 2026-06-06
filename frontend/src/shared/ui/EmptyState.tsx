import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

export interface EmptyStateProps {
  /** Icon shown in the soft circle. */
  icon?: IconName;
  title: string;
  /** One- or two-line explanation of what this area is for. */
  description?: ReactNode;
  /** Primary call to action (usually a <Button>). */
  action?: ReactNode;
  className?: string;
}

/**
 * The helpful empty state every module must ship (master spec "Design Notes":
 * "Every module should have a helpful empty state explaining what it's for and how
 * to start"). Warm, encouraging, never a dead end.
 */
export function EmptyState({ icon = "info", title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-surface-border bg-surface-raised px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-600">
        <Icon name={icon} size={26} />
      </div>
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
