import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { OsIcon, type IconName } from "./icons";
import "../styles/components.css";

export type ToastTone = "success" | "danger" | "warning" | "info";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ToastApi {
  /** Show a toast (default tone 'info', auto-dismisses after `durationMs`, default 4000). */
  toast: (message: string, tone?: ToastTone, durationMs?: number) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICON: Record<ToastTone, IconName> = {
  success: "check",
  danger: "x",
  warning: "alert",
  info: "sparkle",
};

export interface ToastProviderProps {
  children: ReactNode;
}

/** ToastProvider — mounts the toast stack (inline-start bottom) + context. */
export function ToastProvider({ children }: ToastProviderProps): ReactElement {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number): void => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info", durationMs = 4000): void => {
      const id = nextId.current++;
      setItems((prev) => [...prev, { id, message, tone }]);
      if (durationMs > 0) {
        window.setTimeout(() => dismiss(id), durationMs);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="os-toasts" role="region" aria-label="הודעות מערכת">
        {items.map((t) => (
          <div key={t.id} className={`os-toast os-toast--${t.tone}`} role="status">
            <span className="os-toast__icon">
              <OsIcon name={TONE_ICON[t.tone]} size={14} />
            </span>
            <span>{t.message}</span>
            <button
              type="button"
              className="os-close-btn os-toast__close"
              onClick={() => dismiss(t.id)}
              aria-label="סגירת הודעה"
            >
              <OsIcon name="x" size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** useToast — must be used inside ToastProvider (throws otherwise, honestly). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast חייב לרוץ בתוך <ToastProvider> — עטפו את האפליקציה ב-ToastProvider.");
  }
  return ctx;
}
