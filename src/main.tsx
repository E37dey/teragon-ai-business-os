import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./app/queryClient";
import { createAppRouter } from "./app/router";
import { AuthProvider } from "./auth/AuthProvider";
import { RootErrorBoundary } from "./app/RootErrorBoundary";
import { DemoModeBanner } from "./app/DemoModeBanner";
import { ThemeProvider } from "./theme/ThemeProvider";
import { installProvenance } from "./runtime/provenance";
import { bootLocalPersistence } from "./app/bootPersistence";
import "./index.css";

async function boot() {
  // Publish SAFE runtime provenance first so an acceptance harness can verify the
  // build (provider / masked ref / commit / flags) BEFORE any login or write.
  installProvenance();
  try {
    // S9.1-A: local IndexedDB boot init (seed / migrations / ui-settings /
    // notifications) runs ONLY in LOCAL mode. In SUPABASE mode it is a no-op —
    // no local domain DB, no demo rows, no local sync (no mixed-provider state).
    await bootLocalPersistence();
  } catch (err) {
    // local boot must never block the UI — the app still renders (empty state)
    console.error("[teragon-os] local persistence boot failed:", err);
  }
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("#root element missing in index.html");
  createRoot(rootEl).render(
    <StrictMode>
      {/* Outermost on purpose: it must survive a failure in ANY provider below
          it, so its fallback deliberately uses no provider-backed component. */}
      <RootErrorBoundary>
        <ThemeProvider>
          {/* Above the router on purpose: the demo notice must be visible on
              EVERY route, including /login, and must not depend on auth. */}
          <DemoModeBanner />
          <AuthProvider>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={createAppRouter()} />
            </QueryClientProvider>
          </AuthProvider>
        </ThemeProvider>
      </RootErrorBoundary>
    </StrictMode>,
  );
}

void boot();
