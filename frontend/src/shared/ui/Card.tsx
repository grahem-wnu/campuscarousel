import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Remove the default inner padding (e.g. for tables/media that bleed to the edge). */
  flush?: boolean;
  /** Raise elevation on hover (for clickable cards). */
  interactive?: boolean;
  children?: ReactNode;
}

/** Surface container. The default content block for most modules. */
export function Card({ flush, interactive, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-surface-border bg-surface-raised shadow-sm",
        !flush && "p-4 sm:p-5",
        interactive && "transition-shadow hover:shadow-md",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-3", className)}>
      <div>
        <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
