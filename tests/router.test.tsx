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
  it("has the full 31-entry route table (30 routes + customers index sample)", () => {
    expect(APP_ROUTES.length).toBe(31);
  });

  for (const r of APP_ROUTES) {
    it(`${r.navPath} renders "${r.title}"`, async () => {
      mount(r.navPath);
      // title appears in the page heading (and possibly the nav) — at least once.
      // /submission/presentation is a top-level lazy route outside OsShell (W7-F),
      // so its content (which contains the title) must be awaited.
      const matches =
        r.path === "/submission/presentation"
          ? await screen.findAllByText((text) => text.includes(r.title))
          : screen.getAllByText((text) => text.includes(r.title));
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
