// W6-A — schema round-trips + the confidence-is-never-a-bare-number contract.
import { describe, expect, it } from "vitest";
import {
  memoryConfidenceSchema,
  memoryProposalSchema,
  memoryRecordV2Schema,
  memorySourceSchema,
  memoryVersionSchema,
  MEMORY_LAYER_LABELS_HE,
  MEMORY_LAYERS,
  type MemoryProposal,
  type MemoryRecordV2,
  type MemoryVersion,
} from "@/domain/memory";
import { unavailableConfidence } from "@/domain/ai/envelope";

function fixtureRecord(): MemoryRecordV2 {
  return {
    id: "memr-1",
    createdAt: "2026-07-23T08:00:00.000Z",
    updatedAt: "2026-07-23T08:00:00.000Z",
    organizationId: "org-teragon",
    title: "בדיקת סכימה",
    slug: "בדיקת-סכימה",
    bodyMarkdown: "# בדיקה\n\nתוכן [[מקושר]]",
    plainText: "בדיקה\n\nתוכן מקושר",
    memoryLayer: "business",
    folder: "החלטות",
    entityLinks: [{ collection: "customers", entityId: "cust-1", label: "לקוח" }],
    tags: ["בדיקה"],
    wikiLinks: ["מקושר"],
    backlinks: [],
    sourceIds: ["msrc-1"],
    ownerId: "u-tzachi",
    ownerName: "צחי זוסטייהם",
    sensitivity: "פנימי",
    verificationState: "לא נבדק",
    approvalState: "מאושר",
    confidence: unavailableConfidence("בדיקה"),
    approvedAt: "2026-07-23T08:00:00.000Z",
    approvedBy: "צחי זוסטייהם",
    version: 1,
    supersedesId: null,
    retentionPolicy: "קבוע",
    reviewDate: null,
    archivedAt: null,
    origin: "proposal",
  };
}

describe("memory schemas", () => {
  it("round-trips a valid MemoryRecordV2", () => {
    const record = fixtureRecord();
    const parsed = memoryRecordV2Schema.parse(JSON.parse(JSON.stringify(record)));
    expect(parsed).toEqual(record);
  });

  it("REJECTS a bare-number confidence (the honesty contract)", () => {
    const record = { ...fixtureRecord(), confidence: 87 as never };
    expect(memoryRecordV2Schema.safeParse(record).success).toBe(false);
    expect(memoryConfidenceSchema.safeParse(87).success).toBe(false);
    expect(memoryConfidenceSchema.safeParse("גבוה").success).toBe(false);
  });

  it("rejects confidence values outside 0–100 and empty method", () => {
    expect(
      memoryConfidenceSchema.safeParse({
        value: 130,
        label: "x",
        method: "y",
        contributingSignals: [],
        status: "measured",
      }).success,
    ).toBe(false);
    expect(
      memoryConfidenceSchema.safeParse({
        label: "x",
        method: "",
        contributingSignals: [],
        status: "unavailable",
      }).success,
    ).toBe(false);
  });

  it("accepts honest unavailable confidence without a value", () => {
    const parsed = memoryConfidenceSchema.parse(unavailableConfidence("לא נמדד"));
    expect(parsed.status).toBe("unavailable");
    expect(parsed.value).toBeUndefined();
    expect(parsed.label).toBe("טרם נמדד");
  });

  it("round-trips a MemoryProposal", () => {
    const proposal: MemoryProposal = {
      id: "memp-1",
      createdAt: "2026-07-23T08:00:00.000Z",
      updatedAt: "2026-07-23T08:00:00.000Z",
      organizationId: "org-teragon",
      observationHe: "תצפית",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: {
        title: "כותרת",
        slug: "כותרת",
        bodyMarkdown: "תוכן",
        memoryLayer: "customer",
        folder: "לקוחות",
        entityLinks: [],
        tags: [],
        sourceIds: ["msrc-1"],
        sensitivity: "פנימי",
        retentionPolicy: "קבוע",
        reviewDate: null,
      },
      status: "ממתין לאישור",
      checks: {
        sourceValidation: { outcome: "עבר", detailHe: "", relatedIds: [] },
        duplicateCheck: { outcome: "עבר", detailHe: "", relatedIds: [] },
        contradictionCheck: { outcome: "עבר", detailHe: "", relatedIds: [] },
        sensitivityCheck: { outcome: "עבר", detailHe: "", relatedIds: [] },
      },
      approvalId: "memp-1-ap-1",
      runId: "memp-1",
      resultRecordId: null,
      decidedById: null,
      decidedByName: null,
      decidedAt: null,
      mergeTargetId: null,
      moreSourcesRequestHe: null,
    };
    expect(memoryProposalSchema.parse(JSON.parse(JSON.stringify(proposal)))).toEqual(proposal);
  });

  it("round-trips a MemoryVersion (snapshot included)", () => {
    const version: MemoryVersion = {
      id: "memr-1-v-1",
      createdAt: "2026-07-23T08:00:00.000Z",
      updatedAt: "2026-07-23T08:00:00.000Z",
      recordId: "memr-1",
      versionNumber: 1,
      previousVersionId: null,
      snapshot: fixtureRecord(),
      changedFields: [],
      authorId: "u-tzachi",
      authorName: "צחי זוסטייהם",
      approverId: "u-tzachi",
      approverName: "צחי זוסטייהם",
      reasonHe: "אושר מהצעה",
      timestamp: "2026-07-23T08:00:00.000Z",
      rollbackEligible: true,
    };
    expect(memoryVersionSchema.parse(JSON.parse(JSON.stringify(version)))).toEqual(version);
  });

  it("rejects a source without excerpt (memory requires evidence)", () => {
    expect(
      memorySourceSchema.safeParse({
        id: "msrc-1",
        createdAt: "2026-07-23",
        updatedAt: "2026-07-23",
        kind: "entity",
        refId: "customers:cust-1",
        titleHe: "לקוח",
        excerpt: "",
        capturedAt: "2026-07-23",
        verified: true,
      }).success,
    ).toBe(false);
  });

  it("has exact Hebrew labels for the four layers", () => {
    expect(MEMORY_LAYERS).toHaveLength(4);
    expect(MEMORY_LAYER_LABELS_HE.customer).toBe("זיכרון לקוחות");
    expect(MEMORY_LAYER_LABELS_HE.business).toBe("זיכרון עסקי");
    expect(MEMORY_LAYER_LABELS_HE.technical).toBe("זיכרון מקצועי");
    expect(MEMORY_LAYER_LABELS_HE.agent_learning).toBe("זיכרון סוכנים");
  });
});
