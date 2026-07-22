import { useEffect, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { OsIcon } from "./icons";
import "../styles/components.css";

export interface DrawerProps {
  open: boolean;
  /** Called on overlay click, close button, or ESC. */
  onClose: () => void;
  title: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Drawer — RTL side panel sliding in from the inline-start edge
 * (physical right in RTL). ESC and overlay click close it.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  className = "",
}: DrawerProps): ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="os-overlay" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={`os-drawer ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="os-drawer__head">
          <span className="os-drawer__title">{title}</span>
          <button type="button" className="os-close-btn" onClick={onClose} aria-label="סגירה">
            <OsIcon name="x" size={14} />
          </button>
        </div>
        <div className="os-drawer__body">{children}</div>
      </div>
    </>
  );
}
