// STUB — replaced by the Wave 4 module agent (PAGE_CONTRACT). Do not wire the router here.
import { useLocation } from "react-router-dom";
import PlaceholderPage from "@/app/PlaceholderPage";

export default function TasksPage() {
  const location = useLocation();
  return <PlaceholderPage title="משימות ופגישות" wave={4} path={location.pathname} />;
}
