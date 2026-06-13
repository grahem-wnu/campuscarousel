/**
 * Shared UI primitives. Modules compose these; they do not fork or restyle them
 * (design-system.md "Shared primitives"). Import from `@shared/ui` (or a relative
 * path) — never re-implement a button/card/modal in a module.
 */
export { cn, type ClassValue } from "./cn";
export { safeHref } from "./safeHref";
export { Icon, isIconName, type IconName, type IconProps } from "./Icon";
export { Spinner, type SpinnerProps } from "./Spinner";
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export { Card, CardHeader, type CardProps } from "./Card";
export { Badge, type BadgeProps, type BadgeTone } from "./Badge";
export { Chip, Chips, type ChipProps } from "./Chips";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { Tabs, type TabsProps, type TabItem } from "./Tabs";
export { Table, type TableProps, type Column } from "./Table";
export {
  Field,
  Input,
  Textarea,
  Select,
  TextField,
  type FieldProps,
  type InputProps,
  type TextareaProps,
  type SelectProps,
} from "./Field";
export { DateField, type DateFieldProps } from "./DateField";
export { Modal, type ModalProps, type ModalSize } from "./Modal";
export { ToastProvider, useToast, type ToastTone } from "./Toast";
