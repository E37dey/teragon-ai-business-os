// STUB — replaced by the Wave 3 module agent (PAGE_CONTRACT). Do not wire the router here.
import { useLocation } from "react-router-dom";
import PlaceholderPage from "@/app/PlaceholderPage";

export default function SalesPage() {
  const location = useLocation();
  return <PlaceholderPage title="מכירות והתאמת מדפסות" wave={3} path={location.pathname} />;
}
