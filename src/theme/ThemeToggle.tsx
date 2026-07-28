// Compact quick theme control for the top header / profile area.
// Cycles בהיר → כהה → לפי המערכת. Accessible name announces current + next.
import type { ReactElement } from "react";
import { useTheme } from "./themeContext";
import { THEME_LABELS_HE, type ThemePreference } from "./themeContract";

const ORDER: readonly ThemePreference[] = ["light", "dark", "system"];
const GLYPH: Record<ThemePreference, string> = { light: "☀", dark: "☾", system: "◐" };

export function ThemeToggle(): ReactElement {
  const { currentPreference, resolvedTheme, setPreference } = useTheme();
  const next = ORDER[(ORDER.indexOf(currentPreference) + 1) % ORDER.length] ?? "light";
  const resolvedHe = resolvedTheme === "dark" ? "כהה" : "בהיר";
  return (
    <button
      type="button"
      className="os-header__iconbtn"
      onClick={() => setPreference(next)}
      aria-label={`ערכת נושא: ${THEME_LABELS_HE[currentPreference]} (מוצג ${resolvedHe}). מעבר ל${THEME_LABELS_HE[next]}`}
      title={`ערכת נושא: ${THEME_LABELS_HE[currentPreference]}`}
      data-testid="theme-toggle"
      data-theme-pref={currentPreference}
    >
      <span aria-hidden="true" style={{ fontSize: "14px", lineHeight: 1 }}>
        {GLYPH[currentPreference]}
      </span>
    </button>
  );
}
