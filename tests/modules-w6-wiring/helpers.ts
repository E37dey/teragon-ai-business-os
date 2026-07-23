// W6 WIRING tests — shared fixtures: fresh factory stores, V2-record and
// governance-record factories. InMemory repositories in jsdom come pre-seeded
// with the demo data (like the W5-D command tests rely on).
import { unavailableConfidence } from "@/domain/ai/envelope";
import type { AIRecommendation, Approval, Customer, Evidence } from "@/domain/types";
import type { MemoryRecordV2 } from "@/domain/memory";
import { __resetRepositoriesForTests, getRepository } from "@/repositories";
import { __resetMemoryEngineForTests } from "@/memory/core/engine";
import { __resetAgentEngineForTests } from "@/components/ai/engine";

export const T0 = "2026-07-20T08:00:00.000Z";

/** fresh seeded repositories + fresh engine singletons per test */
export function freshAll(): void {
  __resetRepositoriesForTests();
  __resetMemoryEngineForTests();
  __resetAgentEngineForTests();
}

let v2Seq = 0;

/** fully-formed approved V2 memory record (override to vary) */
export function makeV2Record(overrides: Partial<MemoryRecordV2> = {}): MemoryRecordV2 {
  v2Seq += 1;
  return {
    id: `memr-t-${v2Seq}`,
    createdAt: T0,
    updatedAt: T0,
    organizationId: "org-teragon",
    title: `פריט זיכרון בדיקה ${v2Seq}`,
    slug: `test-record-${v2Seq}`,
    bodyMarkdown: "תוכן בדיקה",
    plainText: "תוכן בדיקה",
    memoryLayer: "customer",
    folder: "לקוחות",
    entityLinks: [],
    tags: [],
    wikiLinks: [],
    backlinks: [],
    sourceIds: [],
    ownerId: "u-tzachi",
    ownerName: "צחי זוסטייהם",
    sensitivity: "פנימי",
    verificationState: "לא נבדק",
    approvalState: "מאושר",
    confidence: unavailableConfidence("בדיקה — לא נמדד"),
    approvedAt: T0,
    approvedBy: "צחי זוסטייהם",
    version: 1,
    supersedesId: null,
    retentionPolicy: "קבוע",
    reviewDate: null,
    archivedAt: null,
    origin: "proposal",
    ...overrides,
  };
}

export async function firstCustomer(): Promise<Customer> {
  const customers = await getRepository<Customer>("customers").list();
  const first = customers[0];
  if (!first) throw new Error("seed has no customers");
  return first;
}

/** persist a rec + decided approval + evidence records for evidence tests */
export async function seedRejectedRecommendation(): Promise<{
  rec: AIRecommendation;
  approval: Approval;
}> {
  const approvals = getRepository<Approval>("approvals");
  const recs = getRepository<AIRecommendation>("aiRecommendations");
  const evidence = getRepository<Evidence>("evidence");
  const approval = await approvals.create({
    id: "ap-w6t-1",
    createdAt: T0,
    updatedAt: "2026-07-21T09:00:00.000Z",
    subjectRef: "ai-recommendation:rec-w6t-1",
    requestedById: "ag-hunter",
    requestedAt: T0,
    status: "נדחה",
    decidedById: "u-tzachi",
    decidedAt: "2026-07-21T09:00:00.000Z",
    note: "הלקוח ביקש לא לפנות אליו החודש",
  });
  const ev = await evidence.create({
    id: "ev-w6t-1",
    createdAt: T0,
    updatedAt: T0,
    subjectRef: "ai-recommendation:rec-w6t-1",
    sourceType: "entity",
    sourceRef: "lead:l-1",
    claim: "ראיה תומכת לבדיקה",
    capturedAt: T0,
  });
  const rec = await recs.create({
    id: "rec-w6t-1",
    createdAt: T0,
    updatedAt: "2026-07-21T09:00:00.000Z",
    agentId: "ag-hunter",
    title: "המלצת בדיקה שנדחתה",
    reason: "סיבת בדיקה",
    evidenceIds: [ev.id],
    confidenceMethod: null,
    nextAction: "פעולה",
    approvalRequired: true,
    approvalId: approval.id,
    entityRef: "lead:l-1",
  });
  return { rec, approval };
}
