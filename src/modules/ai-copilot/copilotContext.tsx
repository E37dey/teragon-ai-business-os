// W5-D — Copilot open/close state provider. The lead integrates
// CopilotProvider + <CopilotWorkspace/> in OsShell (exact snippet in
// docs/integration-requests-w5d.md).
import { useCallback, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { CopilotContext } from "./copilotApi";

export function CopilotProvider({ children }: { children: ReactNode }): ReactElement {
  const [open, setOpen] = useState(false);
  const openCopilot = useCallback(() => setOpen(true), []);
  const closeCopilot = useCallback(() => setOpen(false), []);
  const toggleCopilot = useCallback(() => setOpen((v) => !v), []);
  const api = useMemo(
    () => ({ open, openCopilot, closeCopilot, toggleCopilot }),
    [open, openCopilot, closeCopilot, toggleCopilot],
  );
  return <CopilotContext.Provider value={api}>{children}</CopilotContext.Provider>;
}
