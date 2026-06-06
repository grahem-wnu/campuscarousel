import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

export interface ChipProps {
  children: ReactNode;
  /** Render a remove (×) affordance and call this when clicked. */
  onRemove?: () => void;
  /** Selected/active styling (e.g. an applied filter). */
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

/** A small tag/filter token. Clickable (filter) and/or removable (applied value). */
export function Chip({ children, onRemove, selected, onClick, className }: ChipProps) {
  const interactive = Boolean(onClick);
  const Tag = interactive ? "button" : "span";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        selected
          ? "border-primary-500 bg-primary-50 text-primary-800"
          : "border-surface-border bg-surface-raised text-ink-700",
        interactive && "hover:border-primary-400 hover:bg-primary-50",
        className,
      )}
    >
      {children}
      {onRemove ? (
        <span
          role="button"
          aria-label="Remove"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRemove();
            }
          }}
          className="-mr-1 rounded-full p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
        >
          <Icon name="close" size={12} />
        </span>
      ) : null}
    </Tag>
  );
}

/** Horizontal wrap container for chips. */
export function Chips({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
