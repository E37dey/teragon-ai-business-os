// W8-A test helpers — REAL AnalyticsSources from the deterministic seed.
import {
  ACTIVITIES,
  AI_RECOMMENDATIONS,
  APPROVALS,
  AUDIT_EVENTS,
  AUTOMATIONS,
  AUTOMATION_RUNS,
  CUSTOMERS,
  ENROLLMENTS,
  LEADS,
  METRIC_DEFINITIONS,
  METRIC_OBSERVATIONS,
  QUOTATIONS,
  SERVICE_TICKETS,
  SUPPORT_REQUESTS,
  TASKS,
  USERS,
} from "@/repositories/seed";
import type { AnalyticsSources } from "@/analytics";

/** fixed clock — one day after the seed anchor, like WAVE_8 baseline */
export const TEST_NOW_ISO = "2026-07-23T12:00:00.000Z";

export function buildSources(overrides: Partial<AnalyticsSources> = {}): AnalyticsSources {
  return {
    leads: LEADS,
    activities: ACTIVITIES,
    quotations: QUOTATIONS,
    serviceTickets: SERVICE_TICKETS,
    approvals: APPROVALS,
    supportRequests: SUPPORT_REQUESTS,
    enrollments: ENROLLMENTS,
    tasks: TASKS,
    customers: CUSTOMERS,
    agentRuns: [],
    aiRecommendations: AI_RECOMMENDATIONS,
    auditEvents: AUDIT_EVENTS,
    knowledgeUsage: [],
    memoryUsage: [],
    automations: AUTOMATIONS,
    automationRuns: AUTOMATION_RUNS,
    metricDefinitions: METRIC_DEFINITIONS,
    metricObservations: METRIC_OBSERVATIONS,
    users: USERS,
    nowISO: TEST_NOW_ISO,
    ...overrides,
  };
}
