import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

const CONTROL =
  "w-full rounded-lg border bg-surface-raised px-3 text-sm text-ink-900 placeholder:text-ink-400 " +
  "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 " +
  "disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400";

function controlBorder(invalid?: boolean): string {
  return invalid ? "border-error-400" : "border-surface-border";
}

/**
 * Field wraps a control with a label, optional hint, and error message, wiring
 * `htmlFor`/`aria-describedby` for accessibility. Compose it around the inputs below.
 */
export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** The control. If you pass `id` to the control, also pass `htmlFor` here. */
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}

export function Field({ label, hint, error, required, children, htmlFor, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink-700">
          {label}
          {required ? <span className="ml-0.5 text-error-600">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-error-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, controlBorder(invalid), "h-10", className)}
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, controlBorder(invalid), "py-2", className)}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, controlBorder(invalid), "h-10 pr-8", className)}
      {...rest}
    >
      {children}
    </select>
  );
});

/**
 * Convenience: a labeled text input in one component, generating a stable id.
 * For custom controls, use <Field> + the bare inputs directly.
 */
export function TextField({
  label,
  hint,
  error,
  required,
  className,
  ...inputProps
}: InputProps & Pick<FieldProps, "label" | "hint" | "error" | "required" | "className">) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id} className={className}>
      <Input id={id} required={required} invalid={Boolean(error)} {...inputProps} />
    </Field>
  );
}
