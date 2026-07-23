import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./app/queryClient";
import { createAppRouter } from "./app/router";
import { seedIfEmpty } from "./repositories";
import { runMigrationsAtBoot } from "./migrations";
import { syncNotifications } from "./app/notifications/syncNotifications";
import "./index.css";

async function boot() {
  try {
    await seedIfEmpty();
    // Wave 6: schema migrations (m001-m007) — idempotent, audited, never throws
    await runMigrationsAtBoot();
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
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={createAppRouter()} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void boot();
