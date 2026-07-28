/**
 * TERAGON AI BUSINESS OS — no-flash theme resolver.
 *
 * Same-origin classic script loaded synchronously in <head> BEFORE first paint
 * (CSP: script-src 'self' — no inline, no eval, no external request).
 *
 * Source of truth for the preference is the canonical settings repository
 * (IndexedDB, async). This reads a synchronous localStorage MIRROR of that
 * preference so the resolved theme can be applied before any content paints.
 * The mirror is written by ThemePreferenceRepository on every change and
 * reconciled from the repo at boot — it is a pre-paint cache, not a second
 * source of truth. New users (no mirror) default to LIGHT.
 */
(function () {
  var KEY = "teragon.theme.preference";
  var el = document.documentElement;
  try {
    var pref = localStorage.getItem(KEY) || "light";
    if (pref !== "light" && pref !== "dark" && pref !== "system") pref = "light";
    var resolved = pref;
    if (pref === "system") {
      resolved =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    }
    el.setAttribute("data-theme", resolved);
    el.setAttribute("data-theme-pref", pref);
    el.setAttribute("data-theme-init", "ok");
  } catch {
    el.setAttribute("data-theme", "light");
    el.setAttribute("data-theme-pref", "light");
    el.setAttribute("data-theme-init", "fallback");
  }
})();
