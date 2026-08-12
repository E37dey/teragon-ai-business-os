import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// Teragon Trusted-AI live executor config. Runs ONLY evals/runner.trusted-ai.ts
// (node env; talks to staging over HTTP). Excluded from the default suite (whose
// include is tests/**/*.test.ts) — invoked solely by scripts/run-trusted-ai.mjs.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["evals/runner.trusted-ai.ts"],
    globals: false,
    testTimeout: 180_000,
    hookTimeout: 60_000,
    reporters: ["default"],
  },
});
