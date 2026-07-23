// W5-D shared widget — deterministic prompt-injection heuristics over
// user-supplied free text. Detection is rule-based (documented patterns),
// honest about being a heuristic, and NEVER blocks silently — the copilot
// shows the warning and refuses to forward flagged input to any provider.
import type { ReactElement } from "react";
import { OsIcon } from "@/design-system";
import type { InjectionFinding } from "./injection";

export interface InjectionWarningProps {
  findings: readonly InjectionFinding[];
}

export function InjectionWarning({ findings }: InjectionWarningProps): ReactElement | null {
  if (findings.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid="injection-warning"
      style={{
        display: "grid",
        gap: 4,
        fontSize: "var(--os-text-sm, 13px)",
        color: "var(--os-danger)",
        border: "1px solid var(--os-danger-border, var(--os-border))",
        background: "var(--os-danger-soft, transparent)",
        borderRadius: "var(--os-radius-sm, 6px)",
        paddingBlock: "var(--os-space-2)",
        paddingInline: "var(--os-space-3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
        <OsIcon name="shield" size={14} />
        זוהה דפוס החשוד כהזרקת הנחיות — הקלט לא הועבר למנוע
      </div>
      <ul style={{ margin: 0, paddingInlineStart: "1.2em", color: "var(--os-text-2)" }}>
        {findings.map((f) => (
          <li key={f.labelHe}>{f.labelHe}</li>
        ))}
      </ul>
      <div style={{ color: "var(--os-text-2)" }}>
        הזיהוי הוא היוריסטיקה דטרמיניסטית (רשימת דפוסים מתועדת) — לא מודל. ניתן לנסח מחדש את הבקשה.
      </div>
    </div>
  );
}
