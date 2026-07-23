// W8-E — cross-module wiring (integration-requests-w8c #2): the automations
// module must RESPECT the `automation-execution-disable` emergency flag that
// the administration module (W8-C) writes. The gate is pure (testable with a
// boolean) plus a production reader over the real localStorage-backed flag.
import { isEmergencyFlagActive } from "@/administration";

/** The honest Hebrew refusal shown when automation execution is disabled. */
export const AUTOMATION_EXECUTION_DISABLED_HE =
  "הרצת אוטומציות מושבתת — בקרת חירום «השבתת הרצת אוטומציות» פעילה. בטלו אותה במסך ניהול המערכת כדי להמשיך.";

export interface AutomationExecutionGate {
  allowed: boolean;
  /** non-null ⇔ blocked — the exact sentence the UI shows (never silent) */
  reasonHe: string | null;
}

/** Pure gate — same flag state ⇒ same result. */
export function evaluateAutomationExecutionGate(flagActive: boolean): AutomationExecutionGate {
  return flagActive
    ? { allowed: false, reasonHe: AUTOMATION_EXECUTION_DISABLED_HE }
    : { allowed: true, reasonHe: null };
}

/** Production gate — reads the W8-C emergency flag at call time (fresh read). */
export function automationExecutionGate(): AutomationExecutionGate {
  return evaluateAutomationExecutionGate(isEmergencyFlagActive("automation-execution-disable"));
}
