import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

export type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: ReactNode;
}

interface ToastApi {
  /** Show a toast; returns nothing. Auto-dismisses after ~4s. */
  show: (message: ReactNode, tone?: ToastTone) => void;
  success: (message: ReactNode) => void;
  error: (message: ReactNode) => void;
  info: (message: ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICON: Record<ToastTone, IconName> = {
  success: "check",
  error: "warning",
  info: "info",
};

const TONE_STYLE: Record<ToastTone, string> = {
  success: "border-success-200 bg-success-50 text-success-800",
  error: "border-error-200 bg-error-50 text-error-800",
  info: "border-primary-200 bg-primary-50 text-primary-800",
};

/** App-wide toast host. Wrap the shell in this once; modules call {@link useToast}. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: ReactNode, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((cur) => [...cur, { id, tone, message }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, "success"),
      error: (m) => show(m, "error"),
      info: (m) => show(m, "info"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-toast flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-md",
              TONE_STYLE[t.tone],
            )}
          >
            <Icon name={TONE_ICON[t.tone]} size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">{t.message}</div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => remove(t.id)}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Access the toast API. Must be used under a <ToastProvider>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
