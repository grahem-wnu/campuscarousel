import type { ReactNode } from "react";
import { cn } from "./cn";

/** Semantic tones map to the status color-coding used across the spec. */
export type BadgeTone = "neutral" | "primary" | "success" | "warn" | "error" | "info";

export interface BadgeProps {
  tone?: BadgeTone;
  /** Solid fill instead of the default soft tint. */
  solid?: boolean;
  className?: string;
  children: ReactNode;
}

const SOFT: Record<BadgeTone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  primary: "bg-primary-100 text-primary-800",
  success: "bg-success-100 text-success-800",
  warn: "bg-warn-100 text-warn-800",
  error: "bg-error-100 text-error-800",
  info: "bg-primary-50 text-primary-700",
};

const SOLID: Record<BadgeTone, string> = {
  neutral: "bg-ink-600 text-white",
  primary: "bg-primary-600 text-white",
  success: "bg-success-600 text-white",
  warn: "bg-warn-500 text-white",
  error: "bg-error-600 text-white",
  info: "bg-primary-500 text-white",
};

/** Compact status pill. */
export function Badge({ tone = "neutral", solid, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        (solid ? SOLID : SOFT)[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
