// STUB — replaced by the W5-D agent (PAGE_CONTRACT). Do not wire the router here.
import { useLocation } from "react-router-dom";
import PlaceholderPage from "@/app/PlaceholderPage";

export default function AgentsPage() {
  const location = useLocation();
  return <PlaceholderPage title="סוכני AI" wave={5} path={location.pathname} />;
}
