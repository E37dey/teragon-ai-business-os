// Boot-time notification sync — runs after seedIfEmpty(). Derives the current
// notification set from real repository data and creates ONLY the records whose
// stable id does not exist yet. Existing records are never touched, so:
// - refresh never duplicates a notification (stable ids)
// - read/unread state set by the user survives every boot
import type {
  AgentTask,
  AIRecommendation,
  AppNotification,
  Approval,
  AutomationRun,
  Enrollment,
  Lead,
  Quotation,
  ServiceTicket,
  Task,
} from "@/domain/types";
import { getRepository } from "@/repositories";
import { deriveNotifications } from "./deriveNotifications";

/** Derive + persist missing notifications. Returns how many were created. */
export async function syncNotifications(now: Date = new Date()): Promise<number> {
  const [
    leads,
    tasks,
    quotations,
    tickets,
    aiRecommendations,
    approvals,
    enrollments,
    automationRuns,
    agentTasks,
  ] = await Promise.all([
    getRepository<Lead>("leads").list(),
    getRepository<Task>("tasks").list(),
    getRepository<Quotation>("quotations").list(),
    getRepository<ServiceTicket>("serviceTickets").list(),
    getRepository<AIRecommendation>("aiRecommendations").list(),
    getRepository<Approval>("approvals").list(),
    getRepository<Enrollment>("enrollments").list(),
    getRepository<AutomationRun>("automationRuns").list(),
    getRepository<AgentTask>("agentTasks").list(),
  ]);

  const derived = deriveNotifications(
    {
      leads,
      tasks,
      quotations,
      tickets,
      aiRecommendations,
      approvals,
      enrollments,
      automationRuns,
      agentTasks,
    },
    now,
  );

  const repo = getRepository<AppNotification>("notifications");
  const existing = await repo.list();
  const existingIds = new Set(existing.map((n) => n.id));

  let created = 0;
  for (const notification of derived) {
    if (!existingIds.has(notification.id)) {
      await repo.create(notification);
      created += 1;
    }
  }
  return created;
}
