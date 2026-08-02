// Router helper pages — separated from router.tsx so component files only export components.
import { Suspense, lazy } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import { ReturnToPresentation } from "@/modules/presentation";
import PlaceholderPage from "./PlaceholderPage";

/** wraps PlaceholderPage so the live path (incl. params) is shown */
export function RoutedPlaceholder({ title, wave }: { title: string; wave: number }) {
  const location = useLocation();
  const params = useParams();
  const suffix = params.id !== undefined ? ` · ${params.id}` : "";
  return <PlaceholderPage title={`${title}${suffix}`} wave={wave} path={location.pathname} />;
}

export function NotFoundPage() {
  const location = useLocation();
  return (
    <div dir="rtl" style={{ padding: "2.5rem", color: "var(--os-text-2)" }}>
      <h1 style={{ color: "var(--os-text)", fontSize: "1.6rem", margin: 0 }}>העמוד לא נמצא</h1>
      <p>
        הנתיב <code dir="ltr">{location.pathname}</code> אינו קיים במערכת.
      </p>
      <Link to="/" style={{ color: "var(--os-cyan-text)" }}>
        חזרה למרכז הפיקוד
      </Link>
    </div>
  );
}

const LazyPresentationPage = lazy(() => import("@/modules/presentation/PresentationPage"));

/** Top-level presentation route element — outside OsShell for true full-screen (W7-F). */
export function TopLevelPresentation() {
  return (
    <Suspense fallback={<div className="os-route-loading" aria-busy="true" />}>
      <LazyPresentationPage />
    </Suspense>
  );
}

const LazyLoginPage = lazy(() => import("@/auth/LoginPage"));

/** Standalone, full-screen login route element (S8.1). Never gated. */
export function LoginRoute() {
  return (
    <Suspense fallback={<div className="os-route-loading" aria-busy="true" />}>
      <LazyLoginPage />
    </Suspense>
  );
}

/** Shared top layout: floating "חזרה למצגת" control renders app-wide (W7-F). */
export function AppTopLayout() {
  return (
    <>
      <Outlet />
      <ReturnToPresentation />
    </>
  );
}
