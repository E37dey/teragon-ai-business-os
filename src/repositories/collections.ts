// Canonical collection registry — the IndexedDB schema (one object store per
// collection) and the repository factory both derive from this single list.

export const COLLECTIONS = [
  "organizations",
  "users",
  "roles",
  "customers",
  "contacts",
  "leads",
  "opportunities",
  "quotations",
  "products",
  "printerModels",
  "customerPrinters",
  "courses",
  "learningPaths",
  "students",
  "enrollments",
  "courseSessions",
  "assignments",
  "serviceTickets",
  "repairActions",
  "tasks",
  "meetings",
  "activities",
  "documents",
  "knowledgeNotes",
  "memoryRecords",
  "automations",
  "automationRuns",
  "agents",
  "agentTasks",
  "agentMessages",
  "agentHandoffs",
  "agentConflicts",
  "aiRecommendations",
  "evidence",
  "approvals",
  "auditEvents",
  "metricDefinitions",
  "metricObservations",
  "risks",
  "controls",
  "personas",
  "trainingMaterials",
  "implementationStages",
  "stageGates",
  "supportRequests",
  "notifications",
] as const;

export type CollectionKey = (typeof COLLECTIONS)[number];

export function isCollectionKey(value: string): value is CollectionKey {
  return (COLLECTIONS as readonly string[]).includes(value);
}
