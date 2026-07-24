// Courses module — layout-only hook (no domain logic).
// A single mutually-exclusive drawer controller: only one of the page drawers
// (learner list / insights / next-stage) is open at a time, and focus returns
// to the element that opened it once it closes. The Drawer primitive focuses its
// own panel on open and closes on ESC/overlay, but does not restore focus — so
// we manage focus restoration here for accessibility.
import { useCallback, useEffect, useRef, useState } from "react";

export type DrawerKind = "learner" | "insights" | "nextStage";

export interface OpenDrawerController {
  /** Which drawer is open, or null when all are closed. */
  openKind: DrawerKind | null;
  isOpen: (kind: DrawerKind) => boolean;
  /** Open a drawer; opening one closes any other (single-state mutual exclusion). */
  open: (kind: DrawerKind) => void;
  close: () => void;
}

export function useOpenDrawer(): OpenDrawerController {
  const [openKind, setOpenKind] = useState<DrawerKind | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const open = useCallback((kind: DrawerKind): void => {
    // Remember the trigger so focus can return to it on close. When switching
    // from one drawer to another the new trigger becomes the restore target.
    if (document.activeElement instanceof HTMLElement) {
      openerRef.current = document.activeElement;
    }
    setOpenKind(kind);
  }, []);

  const close = useCallback((): void => {
    setOpenKind(null);
  }, []);

  useEffect(() => {
    if (openKind !== null || !openerRef.current) return;
    const opener = openerRef.current;
    openerRef.current = null;
    // restore focus after the drawer has unmounted
    const raf = requestAnimationFrame(() => opener.focus());
    return () => cancelAnimationFrame(raf);
  }, [openKind]);

  const isOpen = useCallback((kind: DrawerKind): boolean => openKind === kind, [openKind]);

  return { openKind, isOpen, open, close };
}
