// STUB — replaced by the Wave 4 module agent (PAGE_CONTRACT). Do not wire the router here.
import { useLocation } from "react-router-dom";
import PlaceholderPage from "@/app/PlaceholderPage";

export default function CoursesPage() {
  const location = useLocation();
  return <PlaceholderPage title="קורסים והכשרות" wave={4} path={location.pathname} />;
}
