// W7-F e2e harness vite config — same plugins/alias as the app config, with
// the harness entry as root. Owned by W7-F (e2e/presentation/**); the shared
// vite.config.ts is untouched. Build output stays inside the harness dir and
// is NOT committed.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./harness", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  preview: {
    port: 4873,
    strictPort: true,
  },
});
