// Page-contextual left rail mechanism (PAGE_CONTRACT).
// A page renders <PageRail>…</PageRail>; OsShell shows it in the LeftIntelligenceRail
// slot, falling back to the honest default when a page provides none.
import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { RailContext, useRailApi } from "./railContext";

export function RailProvider({ children }: { children: ReactNode }): ReactElement {
  const [content, setContent] = useState<ReactNode | null>(null);
  const [hidden, setHidden] = useState(false);
  return (
    <RailContext.Provider value={{ content, setContent, hidden, setHidden }}>
      {children}
    </RailContext.Provider>
  );
}

/**
 * Mount inside a page to publish its contextual rail. Cleans up on unmount,
 * so navigating away restores the default rail automatically.
 */
export function PageRail({ children }: { children: ReactNode }): null {
  const ctx = useRailApi();
  if (!ctx) {
    throw new Error("PageRail חייב לרוץ בתוך RailProvider (OsShell).");
  }
  const { setContent } = ctx;
  useEffect(() => {
    setContent(children);
    return () => setContent(null);
  }, [children, setContent]);
  return null;
}

/**
 * Mount inside a page to hide the shell intelligence rail so the workspace
 * canvas spans full width. For dense pages that own their own contextual
 * layout. Restores the rail automatically on unmount.
 */
export function HideShellRail(): null {
  const ctx = useRailApi();
  if (!ctx) {
    throw new Error("HideShellRail חייב לרוץ בתוך RailProvider (OsShell).");
  }
  const { setHidden } = ctx;
  useEffect(() => {
    setHidden(true);
    return () => setHidden(false);
  }, [setHidden]);
  return null;
}
