// Page-contextual left rail mechanism (PAGE_CONTRACT).
// A page renders <PageRail>…</PageRail>; OsShell shows it in the LeftIntelligenceRail
// slot, falling back to the honest default when a page provides none.
import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { RailContext, useRailApi } from "./railContext";

export function RailProvider({ children }: { children: ReactNode }): ReactElement {
  const [content, setContent] = useState<ReactNode | null>(null);
  return <RailContext.Provider value={{ content, setContent }}>{children}</RailContext.Provider>;
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
