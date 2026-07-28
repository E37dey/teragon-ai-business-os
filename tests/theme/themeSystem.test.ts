// Permanent tests for the Theme System v3 (light default + dark + system,
// canonical persistence, no external fonts, print-always-light).
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  HE_TO_PREF,
  PREF_TO_HE,
  THEME_LABELS_HE,
  resolveTheme,
  isThemePreference,
} from "@/theme/themeContract";
import {
  applyUiSettings,
  settingDefinition,
  type SettingsRecord,
} from "@/modules/settings/settingsStore";

function record(values: Record<string, string> = {}): SettingsRecord {
  return {
    id: "settings",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    values,
    lastChanged: {},
    pending: {},
  };
}

describe("theme contract", () => {
  it("default new-user theme is LIGHT (interface.theme default = בהיר → light)", () => {
    const def = settingDefinition("interface.theme");
    expect(def.defaultValue).toBe("בהיר");
    expect(HE_TO_PREF[String(def.defaultValue)]).toBe("light");
    expect(def.group).toBe("interface");
    expect(def.options).toEqual(["בהיר", "כהה", "לפי המערכת"]);
  });

  it("maps Hebrew label ↔ code both ways", () => {
    expect(HE_TO_PREF["בהיר"]).toBe("light");
    expect(HE_TO_PREF["כהה"]).toBe("dark");
    expect(HE_TO_PREF["לפי המערכת"]).toBe("system");
    expect(PREF_TO_HE.light).toBe("בהיר");
    expect(PREF_TO_HE.dark).toBe("כהה");
    expect(PREF_TO_HE.system).toBe("לפי המערכת");
  });

  it("resolveTheme resolves explicit preferences directly", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("isThemePreference guards", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("neon")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("has Hebrew labels for all three preferences", () => {
    expect(THEME_LABELS_HE).toEqual({ light: "בהיר", dark: "כהה", system: "לפי המערכת" });
  });
});

describe("applyUiSettings applies the theme (canonical → data-theme)", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("empty record ⇒ light (the new-user default)", () => {
    applyUiSettings(record());
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme-pref")).toBe("light");
  });

  it("saved 'כהה' ⇒ dark", () => {
    applyUiSettings(record({ "interface.theme": "כהה" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme-pref")).toBe("dark");
  });

  it("saved 'בהיר' ⇒ light", () => {
    applyUiSettings(record({ "interface.theme": "בהיר" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("no external fonts / CSP-safe", () => {
  it("index.html references no Google Fonts and loads the no-flash init", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/fonts\.gstatic\.com/);
    expect(html).toMatch(/theme-init\.js/);
    expect(html).toMatch(/data-theme="light"/);
  });

  it("tokens.css has no @import Google Fonts and uses the system Hebrew stack", () => {
    const css = readFileSync("src/styles/tokens.css", "utf8");
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
    expect(css).not.toMatch(/@import url\("https/);
    expect(css).toMatch(/Segoe UI/);
    expect(css).toMatch(/Arial Hebrew/);
  });

  it("the no-flash initializer is a plain same-origin script (no external, no eval)", () => {
    const js = readFileSync("public/theme-init.js", "utf8");
    expect(js).not.toMatch(/fonts\.googleapis|fonts\.gstatic|http/);
    expect(js).not.toMatch(/eval\(/);
    expect(js).toMatch(/data-theme/);
  });

  it("tokens.css defines a print-always-light block", () => {
    const css = readFileSync("src/styles/tokens.css", "utf8");
    expect(css).toMatch(/@media print/);
    expect(css).toMatch(/--bg-app: #ffffff/);
  });
});
