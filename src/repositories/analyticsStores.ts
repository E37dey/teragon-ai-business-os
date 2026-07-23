// TERAGON AI BUSINESS OS — typed accessors over the Wave-8 analytics
// collections (W8-A; new file — existing repository files untouched).
// One seam for the analytics domain: report definitions / runs / alerts /
// saved views, plus the read-only bridge collections the engine consumes.
import type {
  Activity,
  AIRecommendation,
  Approval,
  AuditEvent,
  Automation,
  AutomationRun,
  BaseEntity,
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
import type { AgentRun } from "@/domain/agents/types";
import type { KnowledgeUsage } from "@/domain/knowledge/types";
import type { MemoryUsage } from "@/domain/memory/types";
import type {
  AnalyticsView,
  MetricAlert,
  ReportDefinition,
  ReportRun,
} from "@/domain/analytics";
import type { Repository } from "./Repository";
import type { CollectionKey } from "./collections";
import { getRepository } from "./factory";

export interface AnalyticsStores {
  reportDefinitions: Repository<ReportDefinition>;
  reportRuns: Repository<ReportRun>;
  metricAlerts: Repository<MetricAlert>;
  analyticsViews: Repository<AnalyticsView>;
  /** read-only bridges — the engine's real sources */
  leads: Repository<Lead>;
  activities: Repository<Activity>;
  quotations: Repository<Quotation>;
  serviceTickets: Repository<ServiceTicket>;
  approvals: Repository<Approval>;
  supportRequests: Repository<SupportRequest>;
  enrollments: Repository<Enrollment>;
  tasks: Repository<Task>;
  customers: Repository<Customer>;
  agentRuns: Repository<AgentRun>;
  aiRecommendations: Repository<AIRecommendation>;
  auditEvents: Repository<AuditEvent>;
  knowledgeUsage: Repository<KnowledgeUsage>;
  memoryUsage: Repository<MemoryUsage>;
  automations: Repository<Automation>;
  automationRuns: Repository<AutomationRun>;
  metricDefinitions: Repository<MetricDefinition>;
  metricObservations: Repository<MetricObservation>;
  users: Repository<User>;
  /** generic escape hatch — drilldown resolution across ANY collection */
  collection<T extends BaseEntity = BaseEntity>(key: CollectionKey): Repository<T>;
}

/** Production wiring over the canonical repository factory. */
export function analyticsStores(): AnalyticsStores {
  return {
    reportDefinitions: getRepository<ReportDefinition>("reportDefinitions"),
    reportRuns: getRepository<ReportRun>("reportRuns"),
    metricAlerts: getRepository<MetricAlert>("metricAlerts"),
    analyticsViews: getRepository<AnalyticsView>("analyticsViews"),
    leads: getRepository<Lead>("leads"),
    activities: getRepository<Activity>("activities"),
    quotations: getRepository<Quotation>("quotations"),
    serviceTickets: getRepository<ServiceTicket>("serviceTickets"),
    approvals: getRepository<Approval>("approvals"),
    supportRequests: getRepository<SupportRequest>("supportRequests"),
    enrollments: getRepository<Enrollment>("enrollments"),
    tasks: getRepository<Task>("tasks"),
    customers: getRepository<Customer>("customers"),
    agentRuns: getRepository<AgentRun>("agentRuns"),
    aiRecommendations: getRepository<AIRecommendation>("aiRecommendations"),
    auditEvents: getRepository<AuditEvent>("auditEvents"),
    knowledgeUsage: getRepository<KnowledgeUsage>("knowledgeUsage"),
    memoryUsage: getRepository<MemoryUsage>("memoryUsage"),
    automations: getRepository<Automation>("automations"),
    automationRuns: getRepository<AutomationRun>("automationRuns"),
    metricDefinitions: getRepository<MetricDefinition>("metricDefinitions"),
    metricObservations: getRepository<MetricObservation>("metricObservations"),
    users: getRepository<User>("users"),
    collection: <T extends BaseEntity = BaseEntity>(key: CollectionKey) => getRepository<T>(key),
  };
}
