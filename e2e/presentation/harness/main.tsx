// W7-F e2e harness — boots the REAL app router. Originally this harness ADDED
// the requested wiring itself (top-level /submission/presentation outside
// OsShell + app-wide <ReturnToPresentation/>) because the canonical router did
// not have it yet. Since the W7-F integration landed on main (AppTopLayout in
// src/app/router.tsx now carries BOTH), re-adding them here duplicated the
// return control (Playwright strict-mode violation — 3 w7f tests red on final
// main). W7-G fix (documented in docs/WAVE_7_TEST_RESULTS.md §5): the harness
// now consumes appRouteObjects untouched — it boots exactly what ships.
// Same boot path as src/main.tsx (seedIfEmpty → migrations → notifications).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/app/queryClient";
import { appRouteObjects } from "@/app/router";
import { seedIfEmpty } from "@/repositories";
import { runMigrationsAtBoot } from "@/migrations";
import { syncNotifications } from "@/app/notifications/syncNotifications";
import "@/index.css";

function buildRoutes(): RouteObject[] {
  // the canonical router already mounts the top-level presentation route and
  // the app-wide floating return control (W7-F wiring, integrated on main)
  return appRouteObjects;
}

async function boot(): Promise<void> {
  try {
    await seedIfEmpty();
    await runMigrationsAtBoot();
    await syncNotifications();
  } catch (err) {
    console.error("[w7f-harness] seed/boot failed:", err);
  }
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("#root element missing in harness index.html");
  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={createBrowserRouter(buildRoutes())} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void boot();
