// Router — all 28 canonical routes + /customers index + * NotFound, each rendering
// an honest RTL placeholder inside the temporary MinimalShell. Route objects are
// exported separately so tests can mount them with createMemoryRouter.
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { useLocation, useParams, Link } from "react-router-dom";
import OsShell from "./OsShell";
import PlaceholderPage from "./PlaceholderPage";
import { APP_ROUTES } from "./routes";
import DesignShowcase from "@/design-system/showcase/DesignShowcase";

/** wraps PlaceholderPage so the live path (incl. params) is shown */
function RoutedPlaceholder({ title, wave }: { title: string; wave: number }) {
  const location = useLocation();
  const params = useParams();
  const suffix = params.id !== undefined ? ` · ${params.id}` : "";
  return <PlaceholderPage title={`${title}${suffix}`} wave={wave} path={location.pathname} />;
}

function NotFoundPage() {
  const location = useLocation();
  return (
    <div dir="rtl" style={{ padding: "2.5rem", color: "#98A8BD" }}>
      <h1 style={{ color: "#F5F8FD", fontSize: "1.6rem", margin: 0 }}>העמוד לא נמצא</h1>
      <p>
        הנתיב <code dir="ltr">{location.pathname}</code> אינו קיים במערכת.
      </p>
      <Link to="/" style={{ color: "#20C4E8" }}>
        חזרה למרכז הפיקוד
      </Link>
    </div>
  );
}

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
