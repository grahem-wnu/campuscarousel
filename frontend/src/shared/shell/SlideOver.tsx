import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../ui/cn";
import { Icon } from "../ui/Icon";

export interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Slide in from this edge. Default "right". */
  side?: "right" | "left";
  children?: ReactNode;
}

/** Edge-anchored panel (used for the AI assistant). Portaled; closes on Escape/backdrop. */
export function SlideOver({ open, onClose, title, side = "right", children }: SlideOverProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-slideover">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute top-0 flex h-full w-full max-w-md flex-col bg-surface-raised shadow-lg",
          side === "right" ? "right-0" : "left-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3.5">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
