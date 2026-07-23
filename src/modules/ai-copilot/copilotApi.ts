// W5-D — Copilot context + hook (separate file for the fast-refresh lint rule).
import { createContext, useContext } from "react";

export interface CopilotApi {
  open: boolean;
  openCopilot: () => void;
  closeCopilot: () => void;
  toggleCopilot: () => void;
}

export const CopilotContext = createContext<CopilotApi | null>(null);

/** Hook for any component (nav Copilot card, pages) to drive the drawer. */
export function useCopilot(): CopilotApi {
  const ctx = useContext(CopilotContext);
  if (!ctx) {
    throw new Error("useCopilot חייב לרוץ בתוך CopilotProvider (ראו integration-requests-w5d)");
  }
  return ctx;
}
