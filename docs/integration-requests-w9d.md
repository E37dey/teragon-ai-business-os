# Integration requests — W9-D (Netlify & Release Engineering)

W9-D owns release config (netlify.toml), the deployment/rollback runbooks and the
local preview smoke. It does **not** own shared build config (vite.config.ts,
src/app, src/main). The following are requested from the Integration Lead.

---

## REQ-1 — build-time metadata defines (VITE_APP_VERSION + VITE_BUILD_COMMIT)

**Why.** `src/system-health/buildInfo.ts` reads `import.meta.env.VITE_APP_VERSION`
and `import.meta.env.VITE_BUILD_COMMIT`. Until a build supplies them, System
Health / Settings honestly show **"לא סופק בזמן build"**. Supplying them makes
the release traceable (version + commit) on the live URL.

There are **two** ways to satisfy this. Pick ONE.

### Option A (recommended) — Netlify build environment, ZERO code change

Vite bundles any `VITE_`-prefixed env present at build time. Set both in the
Netlify UI (Site configuration → Environment variables, scope **Builds**) or add
to `netlify.toml [build.environment]`. Netlify already exposes `COMMIT_REF`, so:

```toml
# netlify.toml — OPTIONAL, only if you prefer config over the UI.
# W9-D left this OUT of the committed netlify.toml because COMMIT_REF/version
# resolution is an operator/CI concern; add it if you want it declarative.
[build.environment]
  # VITE_BUILD_COMMIT can reference Netlify's COMMIT_REF at deploy time via the
  # UI; a literal is also fine. VITE_APP_VERSION mirrors package.json "version".
  VITE_APP_VERSION = "0.0.0"      # ← set to the release version
  VITE_BUILD_COMMIT = "$COMMIT_REF" # Netlify substitutes the deploy SHA
```

Helper: `node scripts/deployment/build-info.mjs --env` prints the exact two
lines (version from package.json, commit from `git rev-parse`/`COMMIT_REF`).

### Option B — vite.config.ts `define` (exact diff)

If you want the defines baked by config regardless of env, apply this to
`vite.config.ts` (SHARED — Lead applies, not W9-D):

```diff
--- a/vite.config.ts
+++ b/vite.config.ts
@@
 /// <reference types="vitest/config" />
 import { defineConfig } from "vite";
 import react from "@vitejs/plugin-react";
 import { fileURLToPath, URL } from "node:url";
+import { execSync } from "node:child_process";
+
+function buildCommit(): string {
+  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 12);
+  try {
+    return execSync("git rev-parse --short=12 HEAD", { encoding: "utf8" }).trim();
+  } catch {
+    return "unknown";
+  }
+}
+
+// package.json "version" without an extra import assertion.
+const appVersion =
+  process.env.npm_package_version ??
+  JSON.parse(
+    // eslint-disable-next-line no-undef
+    require("node:fs").readFileSync(new URL("./package.json", import.meta.url), "utf8"),
+  ).version;
 
 // https://vite.dev/config/
 export default defineConfig({
   plugins: [react()],
+  define: {
+    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
+    "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(buildCommit()),
+  },
   resolve: {
     alias: {
       "@": fileURLToPath(new URL("./src", import.meta.url)),
     },
   },
```

> Note: buildInfo.ts already treats empty/missing as "not supplied", so a bad
> git call degrades honestly — never crashes the build.

**W9-D recommends Option A** (no shared-file edit, no test surface change).

---

## REQ-2 — (future, NOT a release blocker) drop `style-src 'unsafe-inline'`

The CSP in `netlify.toml` currently allows `style-src … 'unsafe-inline'`. This is
required today because (1) ~65 components emit dynamic `style={{…}}` inline
attributes and (2) `src/modules/quotations/printView.ts` writes an inline
`<style>` into the print document. `script-src` is already locked to `'self'`
(the XSS-critical vector), so this is a hardening follow-up, not a blocker.

Remediation when the app team is ready:
1. Replace dynamic `style={{ width: x }}` with a static class + CSS custom
   property (`style={{ "--w": x }}` consumed by a stylesheet rule).
2. Give the print `<style>` a nonce or move it to a linked stylesheet.
3. Then remove `'unsafe-inline'` from `style-src` in netlify.toml and re-run
   `node scripts/deployment/preview-smoke.mjs` + the Playwright CSP check.
