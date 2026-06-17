import type { ReactNode } from "react";
import { cn } from "./cn";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Optional count/badge shown after the label. */
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Controlled, underline-style tab bar. */
export function Tabs({ items, value, onChange, className }: TabsProps) {
  return (
    // overflow-x-auto: when the tabs don't fit (mobile, or many slotted-in tabs) the strip scrolls
    // horizontally on its own instead of wrapping or being clipped by the page's overflow-x guard.
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-surface-border", className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-700",
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  active ? "bg-primary-100 text-primary-700" : "bg-ink-100 text-ink-600",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
