// Router smoke — every canonical path (28 routes + /customers index sample +
// NotFound = 30 mounts) renders inside the placeholder shell via createMemoryRouter.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { appRouteObjects } from "@/app/router";
import { APP_ROUTES } from "@/app/routes";

afterEach(cleanup);

function mount(path: string) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("router smoke — all canonical paths render", () => {
  it("has the full 31-entry route table (30 routes + customers index sample)", () => {
    expect(APP_ROUTES.length).toBe(31);
  });

  for (const r of APP_ROUTES) {
    it(`${r.navPath} renders "${r.title}"`, () => {
      mount(r.navPath);
      // title appears in the page heading (and possibly the nav) — at least once
      const matches = screen.getAllByText((text) => text.includes(r.title));
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  }

  it("/customers/:id shows the routed param", async () => {
    mount("/customers/cu-1");
    // module pages are lazy-loaded — await the chunk before asserting
    const matches = await screen.findAllByText((t) => t.includes("cu-1"));
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("unknown path renders the Hebrew NotFound page (mount #30)", () => {
    mount("/no-such-route");
    expect(screen.getByText("העמוד לא נמצא")).toBeTruthy();
  });

  it("placeholder pages state their wave honestly", () => {
    mount("/agents");
    expect(screen.getByText((t) => t.includes("המסך ייבנה בגל 5"))).toBeTruthy();
  });
});
