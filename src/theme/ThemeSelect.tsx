// Text theme selector — בהיר / כהה / לפי המערכת as a segmented radiogroup.
// Replaces the icon-only cycle button: the three options are always spelled out
// and the selected one is unmistakable (steel-blue tint + accent bar + bold).
import type { ReactElement } from "react";
import { useTheme } from "./themeContext";
import { THEME_LABELS_HE, type ThemePreference } from "./themeContract";

const ORDER: readonly ThemePreference[] = ["light", "dark", "system"];
const GLYPH: Record<ThemePreference, string> = { light: "☀", dark: "☾", system: "◐" };

export function ThemeSelect(): ReactElement {
  const { currentPreference, resolvedTheme, setPreference } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="ערכת נושא"
      className="os-theme-select"
      data-testid="theme-select"
      data-theme-pref={currentPreference}
      data-resolved={resolvedTheme}
    >
      {ORDER.map((pref) => {
        const selected = currentPreference === pref;
        return (
          <button
            key={pref}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`os-theme-select__opt${selected ? " is-selected" : ""}`}
            data-testid={`theme-opt-${pref}`}
            data-selected={selected ? "true" : "false"}
            title={`ערכת נושא: ${THEME_LABELS_HE[pref]}`}
            onClick={() => setPreference(pref)}
          >
            <span aria-hidden="true" className="os-theme-select__glyph">
              {GLYPH[pref]}
            </span>
            <span className="os-theme-select__label">{THEME_LABELS_HE[pref]}</span>
          </button>
        );
      })}
    </div>
  );
}
