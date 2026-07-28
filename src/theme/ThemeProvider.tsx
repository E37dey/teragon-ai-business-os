// TERAGON AI BUSINESS OS — ThemeProvider + useTheme (Theme System v3).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  productionThemeRepository,
  type ThemePreferenceRepository,
} from "./ThemePreferenceRepository";
import { systemPreference, type ResolvedTheme, type ThemePreference } from "./themeContract";
import { ThemeContext, type ThemeApi } from "./themeContext";

function applyResolved(resolved: ResolvedTheme, pref: ThemePreference): void {
  const el = document.documentElement;
  el.setAttribute("data-theme", resolved);
  el.setAttribute("data-theme-pref", pref);
}

export function ThemeProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository?: ThemePreferenceRepository;
}): ReactElement {
  const repoRef = useRef<ThemePreferenceRepository>(repository ?? productionThemeRepository());
  const repo = repoRef.current;

  // First render uses the synchronous mirror (already applied by theme-init.js).
  const [pref, setPref] = useState<ThemePreference>(() => repo.readMirror());
  const [sysPref, setSysPref] = useState<ResolvedTheme>(() => systemPreference());

  // Reconcile from the canonical settings repository once on mount.
  useEffect(() => {
    let alive = true;
    void repo.read().then((canonical) => {
      if (alive) setPref(canonical);
    });
    return () => {
      alive = false;
    };
  }, [repo]);

  // Track the OS preference so `system` mode follows prefers-color-scheme live.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => setSysPref(mq.matches ? "dark" : "light");
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: ResolvedTheme = pref === "system" ? sysPref : pref;

  useEffect(() => {
    applyResolved(resolved, pref);
  }, [resolved, pref]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPref(next);
      repo.writeMirror(next); // sync mirror → no flash on the next refresh
      void repo.write(next).catch(() => {
        /* persistence failure must not break the live theme */
      });
    },
    [repo],
  );

  const toggleTheme = useCallback(() => {
    setPreference(resolved === "dark" ? "light" : "dark");
  }, [resolved, setPreference]);

  const api = useMemo<ThemeApi>(
    () => ({
      currentPreference: pref,
      resolvedTheme: resolved,
      systemPreference: sysPref,
      isSystemMode: pref === "system",
      setPreference,
      toggleTheme,
    }),
    [pref, resolved, sysPref, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}
