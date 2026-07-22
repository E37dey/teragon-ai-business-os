// STUB — replaced by the Wave 3 module agent (PAGE_CONTRACT). Do not wire the router here.
import { useLocation, useParams } from "react-router-dom";
import PlaceholderPage from "@/app/PlaceholderPage";

export default function CustomerDetailPage() {
  const location = useLocation();
  const params = useParams();
  const suffix = params.id !== undefined ? ` · ${params.id}` : "";
  return <PlaceholderPage title={`תיק לקוח 360${suffix}`} wave={3} path={location.pathname} />;
}
