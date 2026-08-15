// vNext Phase C — Technician Home. Primary question: "איזו עבודה עליי לבצע עכשיו?"
// Action-first field workspace composed from real tasks + service tickets +
// customer context. Priority is visible; history/metadata are secondary.
import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { EmptyState, OsButton, Panel, SectionTitle, StatusChip } from "@/design-system";
import { useCollection } from "@/app/data/hooks";
import type { ServiceTicket, Task } from "@/domain/types";
import { scopeRecords } from "@/authorization/recordScope";
import { useScopeContext } from "@/authorization/useScope";
import { PortalOnboarding } from "./PortalOnboarding";

const PRIORITY_ORDER: Record<string, number> = { "גבוהה": 0, "בינונית": 1, "נמוכה": 2 };

export default function TechnicianHome(): ReactElement {
  const { portal, scope } = useScopeContext();
  // RECORD SCOPE: a technician sees ONLY tickets/tasks they own (assignee).
  // Enforced centrally — technician A can never read technician B's queue.
  const tickets = scopeRecords(
    "serviceTickets",
    portal,
    scope,
    useCollection<ServiceTicket>("serviceTickets").data ?? [],
  );
  const tasks = scopeRecords("tasks", portal, scope, useCollection<Task>("tasks").data ?? []);

  const openTickets = [...tickets]
    .filter((t) => t.status !== "נסגר" && t.status !== "טופל")
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
  const top = openTickets[0] ?? null;
  const rest = openTickets.slice(1, 5);
  const myTasks = tasks.filter((t) => t.status !== "הושלמה").slice(0, 4);

  return (
    <div className="portal-home portal-home--technician" dir="rtl">
      <PortalOnboarding portal="technician" />

      {/* PRIMARY — current priority job */}
      <Panel variant="raised" className="portal-hero" data-testid="tech-current-job">
        <div className="portal-hero__eyebrow">העבודה הנוכחית</div>
        {top ? (
          <>
            <div className="portal-hero__row">
              <h1 className="portal-hero__title">{top.issue}</h1>
              <StatusChip
                status={top.priority === "גבוהה" ? "חסום" : "פעיל"}
                label={`עדיפות: ${top.priority}`}
              />
            </div>
            <p className="portal-hero__sub">
              לקוח: <b>{top.customerName}</b> · מדפסת: {top.printer} · סטטוס: {top.status}
            </p>
            <div className="portal-hero__actions">
              <Link to="/service">
                <OsButton variant="primary" data-testid="tech-open-job">פתח את הקריאה</OsButton>
              </Link>
              <Link to="/knowledge">
                <OsButton variant="ghost">ידע טכני לפתרון</OsButton>
              </Link>
              <Link to="/ai-workspace">
                <OsButton variant="ghost">עוזר טכני (Fixer)</OsButton>
              </Link>
            </div>
          </>
        ) : (
          <EmptyState
            title="אין כרגע משימות פתוחות שהוקצו לך"
            reason="קריאות חדשות יופיעו כאן לפי עדיפות."
            action={
              <Link to="/knowledge">
                <OsButton variant="primary">מאגר ידע טכני</OsButton>
              </Link>
            }
          />
        )}
      </Panel>

      <div className="portal-grid">
        {/* queue */}
        <Panel className="portal-card" data-testid="tech-queue">
          <SectionTitle title="בהמתנה" subtitle="לפי עדיפות" icon="wrench" />
          {rest.length === 0 ? (
            <EmptyState title="אין קריאות נוספות בתור" reason="התור ריק כרגע." />
          ) : (
            <ul className="portal-list">
              {rest.map((t) => (
                <li key={t.id}>
                  <span className="portal-list__title">
                    {t.issue} · <span className="os-muted">{t.customerName}</span>
                  </span>
                  <StatusChip status={t.priority === "גבוהה" ? "חסום" : "ממתין"} label={t.priority} />
                </li>
              ))}
            </ul>
          )}
          <Link to="/service" className="portal-card__more">כל הקריאות ←</Link>
        </Panel>

        {/* my tasks */}
        <Panel className="portal-card" data-testid="tech-tasks">
          <SectionTitle title="המשימות שלי" subtitle="פעולות ומעקב" icon="clock" />
          {myTasks.length === 0 ? (
            <EmptyState title="אין משימות פתוחות" reason="הכול טופל." />
          ) : (
            <ul className="portal-list">
              {myTasks.map((t) => (
                <li key={t.id}>
                  <span className="portal-list__title">{t.title}</span>
                  <StatusChip status="פעיל" label={t.priority} />
                </li>
              ))}
            </ul>
          )}
          <Link to="/tasks" className="portal-card__more">כל המשימות ←</Link>
        </Panel>
      </div>
    </div>
  );
}
