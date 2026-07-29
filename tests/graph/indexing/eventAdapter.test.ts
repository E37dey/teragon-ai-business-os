// TERAGON Business Graph — Phase 5 event-adapter tests.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { BaseEntity } from "@/domain/types";
import type { ChangeEvent } from "@/repositories/Repository";
import { graphIndexingEventSchema, normalizeChangeEvent } from "@/graph";

const CREATED = "2026-07-01T09:00:00.000Z";
const UPDATED = "2026-07-02T09:00:00.000Z";

function customer(org: string, id: string, extra: Record<string, unknown> = {}): BaseEntity {
  return { id, organizationId: org, name: "לקוח", status: "פעיל", createdAt: CREATED, updatedAt: UPDATED, ...extra } as unknown as BaseEntity;
}

describe("event adapter — normalization", () => {
  it("maps create → CREATE with a resolved org and NO fingerprint for a versionless record", () => {
    const item = customer("org-1", "cu-1");
    const change: ChangeEvent<BaseEntity> = { type: "create", collection: "customers", id: "cu-1", item };
    const ev = normalizeChangeEvent(change, item);
    expect(ev.operation).toBe("CREATE");
    expect(ev.organizationId).toBe("org-1");
    expect(ev.aggregateType).toBe("customer");
    expect(ev.aggregateId).toBe("cu-1");
    expect(ev.sourceRepository).toBe("customers");
    // the adapter assigns NO durable eventId; customers carry no version field, so
    // there is NO source fingerprint (a versionless update is never fingerprint-deduped).
    expect("eventId" in ev).toBe(false);
    expect(ev.sourceFingerprint).toBeNull();
    expect(ev.supported).toBe(true);
    // the DURABLY-stamped event (eventId + sequence) is schema-valid.
    expect(
      graphIndexingEventSchema.safeParse({ ...ev, eventId: "gidxevt:org-1:0", ingestSequence: 0 }).success,
    ).toBe(true);
  });

  it("maps remove → DELETE and update → UPDATE", () => {
    const item = customer("org-1", "cu-1");
    expect(normalizeChangeEvent({ type: "remove", collection: "customers", id: "cu-1", item }, item).operation).toBe("DELETE");
    expect(normalizeChangeEvent({ type: "update", collection: "customers", id: "cu-1", item }, item).operation).toBe("UPDATE");
  });

  it("reads a version field where the registry declares one (memoryRecord.currentVersion)", () => {
    const item = { id: "mem-1", organizationId: "org-1", memoryLayer: "customer", approvalState: "מאושר", currentVersion: 3, createdAt: CREATED, updatedAt: UPDATED } as unknown as BaseEntity;
    const ev = normalizeChangeEvent({ type: "update", collection: "memoryRecords", id: "mem-1", item }, item);
    expect(ev.aggregateVersion).toBe(3);
    // a VERSIONED record yields a source fingerprint (used for duplicate detection).
    expect(ev.sourceFingerprint).toBe("memoryRecords:mem-1:3:APPROVE");
    expect(ev.approvalState).toBe("מאושר");
  });

  it("infers ARCHIVE / SUPERSEDE / REJECT from current field values", () => {
    const archived = { id: "mem-1", organizationId: "org-1", archivedAt: UPDATED, currentVersion: 1, createdAt: CREATED, updatedAt: UPDATED } as unknown as BaseEntity;
    expect(normalizeChangeEvent({ type: "update", collection: "memoryRecords", id: "mem-1", item: archived }, archived).operation).toBe("ARCHIVE");
    const superseded = { id: "mem-2", organizationId: "org-1", supersedesId: "mem-1", currentVersion: 2, createdAt: CREATED, updatedAt: UPDATED } as unknown as BaseEntity;
    expect(normalizeChangeEvent({ type: "update", collection: "memoryRecords", id: "mem-2", item: superseded }, superseded).operation).toBe("SUPERSEDE");
    const rejected = { id: "ka-1", approval: { state: "נדחה" }, createdAt: CREATED, updatedAt: UPDATED } as unknown as BaseEntity;
    expect(normalizeChangeEvent({ type: "update", collection: "knowledgeArticles", id: "ka-1", item: rejected }, rejected).operation).toBe("REJECT");
  });

  it("classifies an org-less record (no organizationField) as unsupported, never inventing an org", () => {
    // a lead has organizationField=null (org is inherited from a parent FK).
    const lead = { id: "l-1", ownerId: "u-1", status: "חדש", createdAt: CREATED, updatedAt: UPDATED } as unknown as BaseEntity;
    const ev = normalizeChangeEvent({ type: "create", collection: "leads", id: "l-1", item: lead }, lead);
    expect(ev.organizationId).toBeNull();
    expect(ev.supported).toBe(false);
    expect(ev.unmappableReason).toBe("ORG_INHERITED");
  });

  it("classifies a record with a missing/blank org value as unmappable", () => {
    const noOrg = { id: "cu-1", status: "פעיל", createdAt: CREATED, updatedAt: UPDATED } as unknown as BaseEntity;
    const ev = normalizeChangeEvent({ type: "create", collection: "customers", id: "cu-1", item: noOrg }, noOrg);
    expect(ev.organizationId).toBeNull();
    expect(ev.supported).toBe(false);
    expect(ev.unmappableReason).toBe("MISSING_ORG");
  });

  it("records an unknown collection safely as UNSUPPORTED (never fabricates a relationship)", () => {
    const ev = normalizeChangeEvent({ type: "create", collection: "totally-unknown", id: "x-1", item: { id: "x-1" } as unknown as BaseEntity });
    expect(ev.aggregateType).toBeNull();
    expect(ev.operation).toBe("UNSUPPORTED");
    expect(ev.supported).toBe(false);
    expect(ev.unmappableReason).toBe("UNSUPPORTED_COLLECTION");
  });

  it("records a clear event safely without crashing", () => {
    const ev = normalizeChangeEvent<BaseEntity>({ type: "clear", collection: "customers" });
    expect(ev.operation).toBe("UNSUPPORTED");
    expect(ev.aggregateId).toBeNull();
    expect(ev.unmappableReason).toBe("CLEAR_EVENT");
    expect(ev.supported).toBe(false);
  });

  it("NEVER copies an entity body / notes / prompt / secret into the event", () => {
    const item = customer("org-1", "cu-1", {
      notes: "SECRET-NOTE-XYZ",
      prompt: "SECRET-PROMPT-XYZ",
      body: "SECRET-BODY-XYZ",
      content: "SECRET-CONTENT-XYZ",
      apiKey: "sk-SECRET-KEY",
    });
    const ev = normalizeChangeEvent({ type: "update", collection: "customers", id: "cu-1", item }, item);
    const serialized = JSON.stringify(ev);
    for (const secret of ["SECRET-NOTE-XYZ", "SECRET-PROMPT-XYZ", "SECRET-BODY-XYZ", "SECRET-CONTENT-XYZ", "sk-SECRET-KEY"]) {
      expect(serialized.includes(secret)).toBe(false);
    }
    expect(ev.changedFields).toEqual([]);
  });
});
