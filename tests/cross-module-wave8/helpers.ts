// W8-E — shared fixtures for the Wave-8 cross-module flow tests.
// Fresh factory state (InMemory pre-seeded in jsdom) + a deterministic clock +
// LIVE AnalyticsSources read straight from the canonical repositories — the
// exact data path the /analytics engine consumes in production.
import { __resetRepositoriesForTests, getRepository } from "@/repositories";
import type {
  Activity,
  AIRecommendation,
  Approval,
  AuditEvent,
  Automation,
  AutomationRun,
  Customer,
  Enrollment,
  Lead,
  MetricDefinition,
  MetricObservation,
  Quotation,
  ServiceTicket,
  SupportRequest,
  Task,
  User,
} from "@/domain/types";
import type { AgentRun } from "@/domain/agents";
import type { KnowledgeUsage } from "@/domain/knowledge";
import type { MemoryUsage } from "@/domain/memory";
import type { AnalyticsSources } from "@/analytics";

/** fixed test clock anchor — one day after the seed anchor (Wave-8 baseline) */
export const NOW_ISO = "2026-07-23T12:00:00.000Z";

/** Deterministic clock: each call advances by stepMs. */
export function makeClock(startISO: string = NOW_ISO, stepMs = 10): () => string {
  let t = Date.parse(startISO);
  return () => {
    const iso = new Date(t).toISOString();
    t += stepMs;
    return iso;
  };
}

export function resetRepos(): void {
  __resetRepositoriesForTests();
}

/** Live AnalyticsSources — read from the SAME repositories the screens use. */
export async function liveAnalyticsSources(nowISO: string = NOW_ISO): Promise<AnalyticsSources> {
  return {
    leads: await getRepository<Lead>("leads").list(),
    activities: await getRepository<Activity>("activities").list(),
    quotations: await getRepository<Quotation>("quotations").list(),
    serviceTickets: await getRepository<ServiceTicket>("serviceTickets").list(),
    approvals: await getRepository<Approval>("approvals").list(),
    supportRequests: await getRepository<SupportRequest>("supportRequests").list(),
    enrollments: await getRepository<Enrollment>("enrollments").list(),
    tasks: await getRepository<Task>("tasks").list(),
    customers: await getRepository<Customer>("customers").list(),
    agentRuns: await getRepository<AgentRun>("agentRuns").list(),
    aiRecommendations: await getRepository<AIRecommendation>("aiRecommendations").list(),
    auditEvents: await getRepository<AuditEvent>("auditEvents").list(),
    knowledgeUsage: await getRepository<KnowledgeUsage>("knowledgeUsage").list(),
    memoryUsage: await getRepository<MemoryUsage>("memoryUsage").list(),
    automations: await getRepository<Automation>("automations").list(),
    automationRuns: await getRepository<AutomationRun>("automationRuns").list(),
    metricDefinitions: await getRepository<MetricDefinition>("metricDefinitions").list(),
    metricObservations: await getRepository<MetricObservation>("metricObservations").list(),
    users: await getRepository<User>("users").list(),
    nowISO,
  };
}

export function base(id: string, at: string = NOW_ISO): { id: string; createdAt: string; updatedAt: string } {
  return { id, createdAt: at, updatedAt: at };
}
