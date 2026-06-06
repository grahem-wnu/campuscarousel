import { forwardRef, useId } from "react";
import { Field, Input, type InputProps, type FieldProps } from "./Field";

export interface DateFieldProps
  extends Omit<InputProps, "type">,
    Pick<FieldProps, "label" | "hint" | "error" | "required" | "className"> {}

/**
 * Native date input wrapped in a Field. Uses `<input type="date">` so it stays
 * dependency-free; values are ISO `YYYY-MM-DD` strings (the format the API expects).
 */
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  { label, hint, error, required, className, ...inputProps },
  ref,
) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id} className={className}>
      <Input
        ref={ref}
        id={id}
        type="date"
        required={required}
        invalid={Boolean(error)}
        {...inputProps}
      />
    </Field>
  );
});
