// TERAGON AI BUSINESS OS — theme contract (Theme System v3).
// Light Enterprise Hybrid (default) + Dark Quiet Enterprise + System.

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Synchronous localStorage mirror key — kept in sync with public/theme-init.js. */
export const THEME_MIRROR_KEY = "teragon.theme.preference";

/** Canonical settings-registry key (see settingsStore interface.theme). */
export const THEME_SETTING_KEY = "interface.theme";

export const THEME_LABELS_HE: Record<ThemePreference, string> = {
  light: "בהיר",
  dark: "כהה",
  system: "לפי המערכת",
};

/** The settings record stores the Hebrew label (like density) — map both ways. */
export const HE_TO_PREF: Record<string, ThemePreference> = {
  בהיר: "light",
  כהה: "dark",
  "לפי המערכת": "system",
};
export const PREF_TO_HE: Record<ThemePreference, string> = {
  light: "בהיר",
  dark: "כהה",
  system: "לפי המערכת",
};

export function systemPreference(): ResolvedTheme {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? systemPreference() : pref;
}

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system";
}
