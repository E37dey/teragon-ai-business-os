// Router — all 28 canonical routes + /customers index + * NotFound, each rendering
// an honest RTL placeholder inside the temporary MinimalShell. Route objects are
// exported separately so tests can mount them with createMemoryRouter.
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import OsShell from "./OsShell";
import { NotFoundPage, RoutedPlaceholder } from "./routerPages";
import { APP_ROUTES } from "./routes";
import DesignShowcase from "@/design-system/showcase/DesignShowcase";

export const appRouteObjects: RouteObject[] = [
  {
    path: "/",
    element: <OsShell />,
    children: [
      ...APP_ROUTES.map((r): RouteObject => {
        const element = <RoutedPlaceholder title={r.title} wave={r.wave} />;
        return r.path === "/" ? { index: true, element } : { path: r.path.slice(1), element };
      }),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  // Design-system showcase — renders its own full AppShell, so it lives outside OsShell.
  { path: "/design", element: <DesignShowcase /> },
];

export function createAppRouter() {
  return createBrowserRouter(appRouteObjects);
}
