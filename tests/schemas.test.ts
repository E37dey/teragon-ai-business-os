// Zod round-trip: every seeded entity family parses through its schema and the
// parsed value deep-equals the input (schemas and seed can never drift).
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  activitySchema,
  agentHandoffSchema,
  agentMessageSchema,
  agentSchema,
  agentTaskSchema,
  aiRecommendationSchema,
  approvalSchema,
  auditEventSchema,
  automationRunSchema,
  automationSchema,
  contactSchema,
  courseSchema,
  customerSchema,
  documentSchema,
  enrollmentSchema,
  evidenceSchema,
  implementationStageSchema,
  knowledgeNoteSchema,
  leadSchema,
  memoryRecordSchema,
  metricDefinitionSchema,
  metricObservationSchema,
  opportunitySchema,
  organizationSchema,
  personaSchema,
  printerModelSchema,
  productSchema,
  quotationSchema,
  serviceTicketSchema,
  stageGateSchema,
  studentSchema,
  taskSchema,
  trainingMaterialSchema,
  userSchema,
} from "@/domain/schemas";
import {
  ACTIVITIES,
  AGENT_HANDOFFS,
  AGENT_MESSAGES,
  AGENT_TASKS,
  AGENTS,
  AI_RECOMMENDATIONS,
  APPROVALS,
  AUDIT_EVENTS,
  AUTOMATION_RUNS,
  AUTOMATIONS,
  CONTACTS,
  COURSES,
  CUSTOMERS,
  DOCUMENTS,
  ENROLLMENTS,
  EVIDENCE,
  IMPLEMENTATION_STAGES,
  KNOWLEDGE_NOTES,
  LEADS,
  MEMORY_RECORDS,
  METRIC_DEFINITIONS,
  METRIC_OBSERVATIONS,
  OPPORTUNITIES,
  ORGANIZATIONS,
  PERSONAS,
  PRINTER_MODELS,
  PRODUCTS,
  QUOTATIONS,
  SERVICE_TICKETS,
  STAGE_GATES,
  STUDENTS,
  TASKS,
  TRAINING_MATERIALS,
  USERS,
} from "@/repositories/seed";

const cases: { name: string; schema: z.ZodType; items: readonly unknown[]; min: number }[] = [
  { name: "organizations", schema: organizationSchema, items: ORGANIZATIONS, min: 5 },
  { name: "users", schema: userSchema, items: USERS, min: 5 },
  { name: "customers", schema: customerSchema, items: CUSTOMERS, min: 15 },
  { name: "contacts", schema: contactSchema, items: CONTACTS, min: 4 },
  { name: "leads", schema: leadSchema, items: LEADS, min: 15 },
  { name: "opportunities", schema: opportunitySchema, items: OPPORTUNITIES, min: 3 },
  { name: "quotations", schema: quotationSchema, items: QUOTATIONS, min: 8 },
  { name: "products", schema: productSchema, items: PRODUCTS, min: 5 },
  { name: "printerModels", schema: printerModelSchema, items: PRINTER_MODELS, min: 8 },
  { name: "courses", schema: courseSchema, items: COURSES, min: 6 },
  { name: "students", schema: studentSchema, items: STUDENTS, min: 6 },
  { name: "enrollments", schema: enrollmentSchema, items: ENROLLMENTS, min: 6 },
  { name: "serviceTickets", schema: serviceTicketSchema, items: SERVICE_TICKETS, min: 10 },
  { name: "tasks", schema: taskSchema, items: TASKS, min: 5 },
  { name: "activities", schema: activitySchema, items: ACTIVITIES, min: 8 },
  { name: "documents", schema: documentSchema, items: DOCUMENTS, min: 6 },
  { name: "knowledgeNotes", schema: knowledgeNoteSchema, items: KNOWLEDGE_NOTES, min: 4 },
  { name: "memoryRecords", schema: memoryRecordSchema, items: MEMORY_RECORDS, min: 4 },
  { name: "automations", schema: automationSchema, items: AUTOMATIONS, min: 3 },
  { name: "automationRuns", schema: automationRunSchema, items: AUTOMATION_RUNS, min: 2 },
  { name: "agents", schema: agentSchema, items: AGENTS, min: 7 },
  { name: "agentTasks", schema: agentTaskSchema, items: AGENT_TASKS, min: 4 },
  { name: "agentMessages", schema: agentMessageSchema, items: AGENT_MESSAGES, min: 6 },
  { name: "agentHandoffs", schema: agentHandoffSchema, items: AGENT_HANDOFFS, min: 2 },
  { name: "aiRecommendations", schema: aiRecommendationSchema, items: AI_RECOMMENDATIONS, min: 2 },
  { name: "evidence", schema: evidenceSchema, items: EVIDENCE, min: 4 },
  { name: "approvals", schema: approvalSchema, items: APPROVALS, min: 3 },
  { name: "auditEvents", schema: auditEventSchema, items: AUDIT_EVENTS, min: 6 },
  { name: "metricDefinitions", schema: metricDefinitionSchema, items: METRIC_DEFINITIONS, min: 9 },
  {
    name: "metricObservations",
    schema: metricObservationSchema,
    items: METRIC_OBSERVATIONS,
    min: 2,
  },
  { name: "personas", schema: personaSchema, items: PERSONAS, min: 7 },
  { name: "trainingMaterials", schema: trainingMaterialSchema, items: TRAINING_MATERIALS, min: 13 },
  {
    name: "implementationStages",
    schema: implementationStageSchema,
    items: IMPLEMENTATION_STAGES,
    min: 6,
  },
  { name: "stageGates", schema: stageGateSchema, items: STAGE_GATES, min: 6 },
];

describe("zod round-trip over the deterministic seed", () => {
  it("covers well over 15 seeded entity families", () => {
    expect(cases.length).toBeGreaterThanOrEqual(15);
  });

  for (const c of cases) {
    it(`${c.name}: every seed item parses and round-trips (n=${c.items.length} ≥ ${c.min})`, () => {
      expect(c.items.length).toBeGreaterThanOrEqual(c.min);
      for (const item of c.items) {
        const parsed = c.schema.parse(item);
        expect(parsed).toEqual(item);
      }
    });
  }

  it("unique ids within every seeded family", () => {
    for (const c of cases) {
      const ids = (c.items as { id: string }[]).map((x) => x.id);
      expect(new Set(ids).size, `duplicate id in ${c.name}`).toBe(ids.length);
    }
  });

  it("rejects invalid data (honesty: bad records must not slip through)", () => {
    expect(() => leadSchema.parse({ id: "x" })).toThrow();
    expect(() => quotationSchema.parse({ ...QUOTATIONS[0], discountPercent: 150 })).toThrow();
    expect(() => agentSchema.parse({ ...AGENTS[0], status: "לא סטטוס אמיתי" })).toThrow();
  });
});
