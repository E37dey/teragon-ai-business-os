/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// Dedicated, SEPARATE discovery path for the authoritative live Supabase
// integration tests (`npm run test:supabase:live`). These are the ONLY tests
// under tests/supabase/live/** and are intentionally EXCLUDED from the default
// suite (see vite.config.ts) so the normal gate reports 0 skipped and never
// skips a live test. They fail hard (no skipping) when SUPABASE_LIVE_TESTS!=1 or
// the local Supabase env is absent — see tests/supabase/live/setup.ts.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // supabase-js talks over HTTP to the local stack; node (not jsdom).
    environment: "node",
    include: ["tests/supabase/live/**/*.test.ts"],
    setupFiles: ["tests/supabase/live/setup.ts"],
    globals: false,
    // live DB round-trips (auth + REST) need headroom.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // machine-readable counts for the CI gate (discovered / executed / failed /
    // skipped). Written to a safe artifact — never contains credentials.
    reporters: ["default", "json"],
    outputFile: { json: "ci-artifacts/live-report.json" },
  },
});
