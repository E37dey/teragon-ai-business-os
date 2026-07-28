// Truthful theme info for /system-health. Informational ONLY — a theme
// preference is neither a health success nor a failure (no green/red).
import type { ReactElement } from "react";
import { Panel, SectionTitle } from "@/design-system";
import { useTheme } from "./themeContext";
import { THEME_LABELS_HE } from "./themeContract";

function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--os-space-4)" }}>
      <span style={{ color: "var(--os-text-2)" }}>{label}</span>
      <span style={{ color: "var(--os-text)" }}>{value}</span>
    </div>
  );
}

export function ThemeHealthCard(): ReactElement {
  const { currentPreference, resolvedTheme, systemPreference } = useTheme();
  const initState =
    typeof document !== "undefined"
      ? (document.documentElement.getAttribute("data-theme-init") ?? "unknown")
      : "unknown";
  return (
    <Panel variant="raised" style={{ padding: "var(--os-space-5)" }}>
      <SectionTitle
        icon="gauge"
        title="ערכת נושא"
        subtitle="מידע בלבד — העדפת תצוגה אינה מדד בריאות (לא ירוק ולא אדום)"
      />
      <div
        data-testid="system-health-theme"
        style={{
          display: "grid",
          gap: "var(--os-space-2)",
          fontSize: "var(--os-text-sm)",
          marginBlockStart: "var(--os-space-3)",
        }}
      >
        <Row label="העדפה שמורה" value={THEME_LABELS_HE[currentPreference]} />
        <Row label="ערכת נושא מיושמת" value={resolvedTheme === "dark" ? "כהה" : "בהיר"} />
        <Row label="העדפת מערכת ההפעלה" value={systemPreference === "dark" ? "כהה" : "בהיר"} />
        <Row label="אתחול ערכת נושא (טרם צביעה)" value={initState === "ok" ? "תקין" : initState} />
        <Row label="אסטרטגיית גופנים" value="מערכת בלבד — Segoe UI / Arial Hebrew" />
        <Row label="בקשות גופן חיצוני" value="0" />
      </div>
    </Panel>
  );
}
