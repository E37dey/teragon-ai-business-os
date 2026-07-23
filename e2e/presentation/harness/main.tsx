// W7-F e2e harness — boots the REAL app with the EXACT router wiring the
// integration queue requests from the lead:
//   1. /submission/presentation is a TOP-LEVEL route OUTSIDE OsShell
//      (true full-screen, like /design);
//   2. the floating <ReturnToPresentation/> control is mounted app-wide.
// Everything else is the canonical appRouteObjects untouched. Same boot path
// as src/main.tsx (seedIfEmpty → migrations → notifications).
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/app/queryClient";
import { appRouteObjects } from "@/app/router";
import { seedIfEmpty } from "@/repositories";
import { runMigrationsAtBoot } from "@/migrations";
import { syncNotifications } from "@/app/notifications/syncNotifications";
import PresentationPage from "@/modules/presentation/PresentationPage";
import { ReturnToPresentation } from "@/modules/presentation/ReturnToPresentation";
import "@/index.css";

function buildRoutes(): RouteObject[] {
  const [shellRoute, ...rest] = appRouteObjects;
  if (!shellRoute) throw new Error("appRouteObjects is empty");
  // remove the nested placeholder — the top-level route below replaces it
  const shellWithoutPresentation: RouteObject = {
    ...shellRoute,
    children: (shellRoute.children ?? []).filter((c) => c.path !== "submission/presentation"),
  };
  return [
    {
      // shared layout: every route renders + the app-wide floating return control
      element: (
        <>
          <Outlet />
          <ReturnToPresentation />
        </>
      ),
      children: [
        {
          path: "/submission/presentation",
          element: (
            <Suspense fallback={<div className="os-route-loading" aria-busy="true" />}>
              <PresentationPage />
            </Suspense>
          ),
        },
        shellWithoutPresentation,
        ...rest,
      ],
    },
  ];
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
