// Toast context + hook — separated from Toast.tsx so that file only exports components (fast-refresh).
import { createContext, useContext } from "react";

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

export const ToastContext = createContext<ToastApi | null>(null);

/** useToast — must be used inside ToastProvider (throws otherwise, honestly). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast חייב לרוץ בתוך <ToastProvider> — עטפו את האפליקציה ב-ToastProvider.");
  }
  return ctx;
}
