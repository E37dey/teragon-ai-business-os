// Router smoke — every canonical path (28 routes + /customers index sample +
// NotFound = 30 mounts) renders inside the placeholder shell via createMemoryRouter.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { appRouteObjects } from "@/app/router";
import { APP_ROUTES } from "@/app/routes";

afterEach(cleanup);

function mount(path: string) {
  const router = createMemoryRouter(appRouteObjects, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("router smoke — all canonical paths render", () => {
  it("has the full 29-entry route table (28 routes + customers index)", () => {
    expect(APP_ROUTES.length).toBe(29);
  });

  for (const r of APP_ROUTES) {
    it(`${r.navPath} renders "${r.title}"`, () => {
      mount(r.navPath);
      // title appears in the page heading (and possibly the nav) — at least once
      const matches = screen.getAllByText((text) => text.includes(r.title));
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  }

  it("/customers/:id shows the routed param", () => {
    mount("/customers/cu-1");
    expect(screen.getAllByText((t) => t.includes("cu-1")).length).toBeGreaterThanOrEqual(1);
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
