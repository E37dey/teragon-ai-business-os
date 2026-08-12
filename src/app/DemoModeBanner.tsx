// TERAGON AI BUSINESS OS — Gate S10.3: persistent demo-environment banner.
//
// It is deliberately NOT dismissible. The whole point is that nobody can look at
// a screen mid-pilot and mistake synthetic rows for the business's own data, so a
// "close" affordance would defeat it.
//
// Plain elements + CSS variables only, so it renders even if a provider below it
// fails, and `role="status"` announces it to assistive tech without stealing focus.
import type { CSSProperties, ReactElement } from "react";
import { DEMO_BANNER_HE, isDemoMode } from "./demoMode";

const bar: CSSProperties = {
  padding: "6px var(--os-space-4, 16px)",
  textAlign: "center",
  fontSize: "var(--os-text-2xs, 12px)",
  fontWeight: 600,
  color: "var(--warning-text, #7a4b00)",
  background: "var(--warning-surface, #fff4d6)",
  borderBlockEnd: "1px solid var(--os-border, #e6c67a)",
  letterSpacing: "0.01em",
};

export function DemoModeBanner(): ReactElement | null {
  if (!isDemoMode()) return null;
  return (
    <div role="status" data-testid="demo-mode-banner" style={bar}>
      {DEMO_BANNER_HE}
    </div>
  );
}

export default DemoModeBanner;
