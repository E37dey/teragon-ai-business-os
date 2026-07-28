// TERAGON AI BUSINESS OS — ThemePreferenceRepository (Theme System v3).
//
// Source of truth = the canonical settings repository (interface.theme, stored
// in the `meta` settings record). A synchronous localStorage MIRROR is written
// alongside so public/theme-init.js can resolve the theme before first paint.
// The mirror is a pre-paint cache, NOT a second source of truth.
import {
  productionSettingsStores,
  readSettingsRecord,
  effectiveValue,
  setSetting,
  settingDefinition,
  type SettingsStores,
} from "@/modules/settings/settingsStore";
import {
  HE_TO_PREF,
  PREF_TO_HE,
  THEME_MIRROR_KEY,
  THEME_SETTING_KEY,
  isThemePreference,
  type ThemePreference,
} from "./themeContract";

const ACTOR = "צחי זוסטייהם";

export interface ThemePreferenceRepository {
  /** Canonical async read from the settings repository (falls back to mirror). */
  read(): Promise<ThemePreference>;
  /** Persist to the settings repository AND update the mirror. */
  write(pref: ThemePreference): Promise<void>;
  /** Synchronous mirror read (used for first render before the async read). */
  readMirror(): ThemePreference;
  /** Synchronous mirror write (flash-prevention cache). */
  writeMirror(pref: ThemePreference): void;
}

export function productionThemeRepository(
  stores: SettingsStores = productionSettingsStores(),
): ThemePreferenceRepository {
  const repo: ThemePreferenceRepository = {
    async read() {
      try {
        const record = await readSettingsRecord(stores);
        const he = String(effectiveValue(record, settingDefinition(THEME_SETTING_KEY)));
        return HE_TO_PREF[he] ?? "light";
      } catch {
        return repo.readMirror();
      }
    },
    async write(pref) {
      // canonical settings repo is the source of truth
      await setSetting(stores, THEME_SETTING_KEY, PREF_TO_HE[pref], ACTOR);
      repo.writeMirror(pref);
    },
    readMirror() {
      try {
        const v = localStorage.getItem(THEME_MIRROR_KEY);
        return isThemePreference(v) ? v : "light";
      } catch {
        return "light";
      }
    },
    writeMirror(pref) {
      try {
        localStorage.setItem(THEME_MIRROR_KEY, pref);
      } catch {
        /* private mode / disabled storage — theme still works for the session */
      }
    },
  };
  return repo;
}
