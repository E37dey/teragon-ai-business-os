import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./app/queryClient";
import { createAppRouter } from "./app/router";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./theme/ThemeProvider";
import { installProvenance } from "./runtime/provenance";
import { seedIfEmpty } from "./repositories";
import { runMigrationsAtBoot } from "./migrations";
import { applyUiSettingsAtBoot } from "./integration/wave8/applyUiSettings";
import { syncNotifications } from "./app/notifications/syncNotifications";
import "./index.css";

async function boot() {
  // Publish SAFE runtime provenance first so an acceptance harness can verify the
  // build (provider / masked ref / commit / flags) BEFORE any login or write.
  installProvenance();
  try {
    await seedIfEmpty();
    // Wave 6: schema migrations (m001-m007) — idempotent, audited, never throws
    await runMigrationsAtBoot();
    // Wave 8: apply persisted UI settings (density, page size) — never throws
    await applyUiSettingsAtBoot();
    // idempotent: stable ids ⇒ refresh never duplicates, read-state survives
    await syncNotifications();
  } catch (err) {
    // seeding must never block the UI — the app still renders (empty state)
    console.error("[teragon-os] seed/notification boot failed:", err);
  }
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("#root element missing in index.html");
  createRoot(rootEl).render(
    <StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={createAppRouter()} />
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}

void boot();
