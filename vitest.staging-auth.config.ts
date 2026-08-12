import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// TERAGON AI BUSINESS OS — Gate S8: DEDICATED live staging Auth integration suite.
//
// Authenticates the real staging admin against teragon-staging and asserts the
// CANONICAL identity (org-teragon / crole-sysadmin / active) resolves through the
// real RLS policies + the current_profile() SECURITY DEFINER RPC, then restores
// and clears the session. It is the ONLY suite under tests/staging-auth/live/**,
// is EXCLUDED from the default suite (see vite.config.ts) so the normal gate
// reports 0 skipped, and NEVER skips — it FAILS HARD unless STAGING_AUTH_LIVE=1
// and the required config is present (see tests/staging-auth/live/env.ts).
// Secrets (admin password / JWT) are never printed or written to any artifact.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/staging-auth/live/**/*.test.ts"],
    setupFiles: ["tests/staging-auth/live/setup.ts"],
    globals: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    reporters: ["default", "json"],
    outputFile: { json: "ci-artifacts/staging-auth-report.json" },
  },
});
