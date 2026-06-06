import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { Icon } from "./Icon";

export type ModalSize = "sm" | "md" | "lg";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Footer actions (e.g. Cancel / Save buttons). */
  footer?: ReactNode;
  size?: ModalSize;
  /** Hide the × button (e.g. a required choice). */
  hideClose?: boolean;
  children?: ReactNode;
}

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

/** Centered dialog rendered in a portal. Closes on Escape and backdrop click. */
export function Modal({ open, onClose, title, footer, size = "md", hideClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "w-full rounded-t-2xl bg-surface-raised shadow-lg sm:rounded-2xl",
          SIZES[size],
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-3.5">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {!hideClose ? (
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              >
                <Icon name="close" size={18} />
              </button>
            ) : null}
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3.5">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
