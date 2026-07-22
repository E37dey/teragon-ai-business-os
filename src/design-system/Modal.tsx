import { useEffect, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { OsIcon } from "./icons";
import "../styles/components.css";

export interface ModalProps {
  open: boolean;
  /** Called on overlay click, close button, or ESC. */
  onClose: () => void;
  title: string;
  children?: ReactNode;
  /** Footer slot (action buttons). */
  footer?: ReactNode;
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal — centered dialog with basic focus trap (Tab cycles inside),
 * ESC close, restores focus to the previously focused element on close.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className = "",
}: ModalProps): ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    // focus the first focusable element, or the dialog itself
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? dialog)?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="os-modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`os-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="os-modal__head">
          <span className="os-modal__title">{title}</span>
          <button type="button" className="os-close-btn" onClick={onClose} aria-label="סגירה">
            <OsIcon name="x" size={14} />
          </button>
        </div>
        <div className="os-modal__body">{children}</div>
        {footer && <div className="os-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
