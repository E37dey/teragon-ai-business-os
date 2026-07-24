// Courses module — layout-only hooks (no domain logic).
// A matchMedia hook drives the viewport breakpoint that decides whether the
// learner list is a permanent column or a drawer, and a small drawer hook that
// restores focus to the opener on close (the Drawer primitive focuses its own
// panel on open but does not restore focus, so we do it here for a11y).
import { useCallback, useEffect, useRef, useState } from "react";

/** Reactive matchMedia — SSR-safe, updates on viewport change. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = (): void => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** True at ≥1800px — the only mode that shows the learner list as a permanent column. */
export function useIsWide(): boolean {
  return useMediaQuery("(min-width: 1800px)");
}

export interface DrawerController {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

/**
 * Drawer open/close state with focus restoration: remembers the element that
 * opened the drawer and returns focus to it once the drawer closes.
 */
export function useDrawer(): DrawerController {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const openDrawer = useCallback((): void => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);

  const closeDrawer = useCallback((): void => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (open || !openerRef.current) return;
    const opener = openerRef.current;
    openerRef.current = null;
    // restore focus after the drawer has unmounted
    const raf = requestAnimationFrame(() => opener.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  return { open, openDrawer, closeDrawer };
}
