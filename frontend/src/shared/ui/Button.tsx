import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show a spinner and disable the button. */
  loading?: boolean;
  /** Optional leading icon. */
  icon?: IconName;
  /** Stretch to the container width. */
  block?: boolean;
  children?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 focus-visible:ring-primary-500",
  secondary:
    "bg-secondary-500 text-white hover:bg-secondary-600 active:bg-secondary-700 focus-visible:ring-secondary-400",
  outline:
    "border border-surface-border bg-surface-raised text-ink-700 hover:bg-ink-50 focus-visible:ring-primary-500",
  ghost: "bg-transparent text-ink-700 hover:bg-ink-100 focus-visible:ring-primary-500",
  danger:
    "bg-error-600 text-white hover:bg-error-700 active:bg-error-800 focus-visible:ring-error-500",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2 rounded-lg",
};

/** Primary interactive control. Composes Spinner + Icon; modules never restyle it. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, icon, block, className, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
});
