/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Build-time metadata (W9-D REQ-1): exposed as import.meta.env.VITE_* so
// /system-health + /settings show a real version/commit instead of the honest
// "לא סופק בזמן build" fallback. Netlify sets COMMIT_REF; locally we read git.
// Every read is guarded — a missing value simply keeps the honest fallback.
function buildCommit(): string {
  if (process.env.VITE_BUILD_COMMIT) return process.env.VITE_BUILD_COMMIT;
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}
function appVersion(): string {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION;
  try {
    return JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"))
      .version as string;
  } catch {
    return "";
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion()),
    "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(buildCommit()),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Live Supabase integration tests are a SEPARATE discovery path (their own
    // config + `npm run test:supabase:live`). They must never appear in the
    // default suite — so the default gate reports 0 skipped, never a skip.
    exclude: [...configDefaults.exclude, "tests/supabase/live/**", "tests/staging-auth/live/**"],
    globals: false,
    // Two projects, ONE default gate (`npm test` runs both):
    //
    //  · app      — the React/domain suite, jsdom as before.
    //  · platform — tests/platform/** exercise the REAL Node ESM provisioning
    //    CLIs in scripts/platform/*.mjs. Those CLIs start with a `#!` shebang,
    //    which is only legal at byte 0. Under the jsdom project Vite's
    //    ssrTransformScript hoists the Node built-in CJS-interop consts to the
    //    top of line 1, pushing the shebang into the middle of that line, and
    //    Rolldown then fails to parse it ("Invalid Character `!`"). That is a
    //    COLLECTION failure: the 12 affected files never executed a single test.
    //    Running them in `node` and marking the platform CLIs external skips the
    //    SSR transform entirely, so Node loads the real .mjs files unmodified.
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          environment: "jsdom",
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
          exclude: [...configDefaults.exclude, "tests/platform/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "platform",
          environment: "node",
          include: ["tests/platform/**/*.test.ts"],
          server: { deps: { external: [/scripts[\\/]platform[\\/].*\.mjs$/] } },
        },
      },
    ],
  },
});
