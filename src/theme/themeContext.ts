// Theme context + hook — separated from ThemeProvider.tsx so the provider file
// only exports a component (fast-refresh clean).
import { createContext, useContext } from "react";
import type { ResolvedTheme, ThemePreference } from "./themeContract";

export interface ThemeApi {
  currentPreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  systemPreference: ResolvedTheme;
  isSystemMode: boolean;
  setPreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeApi | null>(null);

/**
 * Safe default used when a consumer renders outside ThemeProvider (e.g. an
 * isolated component test that mounts the shell without the app root). The real
 * app always provides a value; this keeps such renders from crashing.
 */
const FALLBACK: ThemeApi = {
  currentPreference: "light",
  resolvedTheme: "light",
  systemPreference: "light",
  isSystemMode: false,
  setPreference: () => {},
  toggleTheme: () => {},
};

export function useTheme(): ThemeApi {
  return useContext(ThemeContext) ?? FALLBACK;
}
