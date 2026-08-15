// vNext Phase C — Manager Home. Primary question: "מה דורש את תשומת ליבי?"
// Executive operating center: real decision/approval signals first (reuse the
// governed OperationsBrief), then a compact KPI strip, then quick access. Calm —
// not every TERAGON subsystem on the first screen (Advanced stays in the nav).
import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { KpiCard, OsButton, Panel, SectionTitle } from "@/design-system";
import { useCollection } from "@/app/data/hooks";
import type { Approval, Task } from "@/domain/types";
import type { AgentRun } from "@/domain/agents";
import { OperationsBrief } from "@/modules/command-center/OperationsBrief";
import { PortalOnboarding } from "./PortalOnboarding";

export default function ManagerHome(): ReactElement {
  const approvals = useCollection<Approval>("approvals").data ?? [];
  const tasks = useCollection<Task>("tasks").data ?? [];
  const runs = useCollection<AgentRun>("agentRuns").data ?? [];

  const pending = approvals.filter((a) => a.status === "ממתין").length;
  const openTasks = tasks.filter((t) => t.status !== "הושלמה").length;
  const activeRuns = runs.filter((r) => r.status === "רץ" || r.status === "ממתין לאישור").length;

  return (
    <div className="portal-home portal-home--manager" dir="rtl">
      <PortalOnboarding portal="manager" />

      {/* PRIMARY — decisions / signals / approvals (real governed signals) */}
      <OperationsBrief />

      {/* key indicators — compact, secondary to the decisions above */}
      <div className="portal-kpis" data-testid="manager-kpis">
        <KpiCard title="אישורים ממתינים" value={pending} icon="shield" />
        <KpiCard title="משימות פתוחות" value={openTasks} icon="clock" muted />
        <KpiCard title="ריצות פעילות" value={activeRuns} icon="network" muted />
      </div>

      {/* quick access — the manager's frequent destinations */}
      <Panel className="portal-card" data-testid="manager-quick">
        <SectionTitle title="גישה מהירה" subtitle="היעדים התכופים שלך" icon="gauge" />
        <div className="portal-quicklinks">
          <Link to="/analytics"><OsButton variant="ghost" size="sm">דוחות וניתוחים</OsButton></Link>
          <Link to="/agents/collaboration"><OsButton variant="ghost" size="sm">חדר התיאום</OsButton></Link>
          <Link to="/tasks"><OsButton variant="ghost" size="sm">משימות</OsButton></Link>
          <Link to="/customers"><OsButton variant="ghost" size="sm">לקוחות</OsButton></Link>
          <Link to="/automations"><OsButton variant="ghost" size="sm">אוטומציות</OsButton></Link>
        </div>
      </Panel>
    </div>
  );
}
