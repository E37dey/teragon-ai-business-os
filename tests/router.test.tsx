// Router smoke — every canonical path (28 routes + /customers index sample +
// NotFound = 30 mounts) renders inside the placeholder shell via createMemoryRouter.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { appRouteObjects } from "@/app/router";
import { APP_ROUTES } from "@/app/routes";
import { AuthProvider } from "@/auth/AuthProvider";

afterEach(cleanup);

function mount(path: string) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    // Mount as the app does: AuthProvider resolves to LOCAL in tests, so the
    // RequireAuth gate around OsShell is a pass-through and every route renders.
    <AuthProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthProvider>,
  );
  return router;
}

describe("router smoke — all canonical paths render", () => {
  it("has the full 33-entry route table (32 routes + customers index sample)", () => {
    expect(APP_ROUTES.length).toBe(33); // +1: /ai-workspace (S13.3 · AI Workspace)
  });

  for (const r of APP_ROUTES) {
    it(`${r.navPath} renders "${r.title}"`, async () => {
      mount(r.navPath);
      // Product V2 (S13.1): the shell no longer renders a placeholder rail that
      // echoed the route title synchronously — each page now OWNS its heading. Pages
      // are lazy-loaded, so the title must be awaited (assertion unchanged: the page
      // itself must render its own title at least once).
      const matches = await screen.findAllByText((text) => text.includes(r.title), undefined, {
        timeout: 10_000,
      });
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  }

  it("/customers/:id shows the routed param", async () => {
    mount("/customers/cu-1");
    // module pages are lazy-loaded — await the chunk before asserting
    // generous timeout: lazy chunk resolution can be slow under full-suite parallel load
    const matches = await screen.findAllByText((t) => t.includes("cu-1"), undefined, {
      timeout: 10_000,
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("unknown path renders the Hebrew NotFound page (mount #30)", () => {
    mount("/no-such-route");
    expect(screen.getByText("העמוד לא נמצא")).toBeTruthy();
  });

  it("no placeholder pages remain — every canonical route is operational (Wave 8)", async () => {
    // /system-health was the last placeholder; W8-D built it. Assert real content
    // renders and the honest-placeholder marker is gone.
    mount("/system-health");
    await screen.findAllByText((t) => t.includes("בריאות המערכת"), undefined, {
      timeout: 10_000,
    });
    expect(screen.queryByText((t) => t.includes("המסך ייבנה בגל"))).toBeNull();
  });
});
