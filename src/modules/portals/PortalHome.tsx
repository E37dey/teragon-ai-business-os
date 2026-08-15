// vNext Phase C — /home dispatcher. Renders the role-composed Home for the LIVE
// portal (derived from the trusted canonical role). Authorization stays canonical
// -role driven; the portal only picks the composition. The default operator
// (sysadmin → manager portal) gets the Manager Home.
import { lazy, Suspense } from "react";
import type { ReactElement } from "react";
import { useCurrentRole } from "@/authorization/roleStore";
import { portalForRole } from "@/authorization/portals";

const ManagerHome = lazy(() => import("./ManagerHome"));
const StudentHome = lazy(() => import("./StudentHome"));
const TechnicianHome = lazy(() => import("./TechnicianHome"));

export default function PortalHome(): ReactElement {
  const portal = portalForRole(useCurrentRole());
  const Home = portal === "student" ? StudentHome : portal === "technician" ? TechnicianHome : ManagerHome;
  return (
    <Suspense fallback={<div className="os-route-loading" aria-busy="true" />}>
      <Home />
    </Suspense>
  );
}
