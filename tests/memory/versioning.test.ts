// W6-A — immutable versioning: append-only store, frozen snapshots, compare,
// restore-as-NEW-version (through the proposal workflow), usage join.
import { describe, expect, it } from "vitest";
import { MEMORY_VERSION_IMMUTABLE_HE } from "@/memory/repositories/memoryStores";
import {
  compareVersions,
  envelopesForVersion,
  latestVersion,
  recordUsage,
  submitRestoreProposal,
  usageJoinForRecord,
  versionsOf,
} from "@/memory/core/versioning";
import { freshWorkflow, makeDraft, seedSource, TZACHI } from "./helpers";

async function approvedBase() {
  const bundle = freshWorkflow();
  await seedSource(bundle.stores);
  const proposal = await bundle.workflow.submitProposal({
    observationHe: "בסיס",
    proposedById: "agent-memory",
    proposedByName: "סוכן זיכרון",
    draft: makeDraft({ title: "פריט בסיס לגרסאות", bodyMarkdown: "גרסה ראשונה: תוכן" }),
  });
  const record = await bundle.workflow.approve(proposal.id, TZACHI);
  return { ...bundle, record };
}

describe("memory versioning", () => {
  it("versions store is append-only: update/remove/clear throw", async () => {
    const { stores, record } = await approvedBase();
    const versions = versionsOf(await stores.versions.list(), record.id);
    expect(versions).toHaveLength(1);
    await expect(async () => stores.versions.update(versions[0]!.id, { reasonHe: "שינוי" })).rejects.toThrow(
      MEMORY_VERSION_IMMUTABLE_HE,
    );
    await expect(async () => stores.versions.remove(versions[0]!.id)).rejects.toThrow(
      MEMORY_VERSION_IMMUTABLE_HE,
    );
    await expect(async () => stores.versions.clear()).rejects.toThrow(MEMORY_VERSION_IMMUTABLE_HE);
  });

  it("snapshots are deep-frozen — mutation throws in strict mode", async () => {
    const { stores, record } = await approvedBase();
    const version = latestVersion(await stores.versions.list(), record.id)!;
    expect(Object.isFrozen(version)).toBe(true);
    expect(Object.isFrozen(version.snapshot)).toBe(true);
    expect(() => {
      (version.snapshot as { title: string }).title = "שונה";
    }).toThrow();
  });

  it("every approved edit (merge) appends a new version with changedFields", async () => {
    const { stores, workflow, record } = await approvedBase();
    const second = await workflow.submitProposal({
      observationHe: "עדכון",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({ title: "עדכון תוכן שונה לגמרי", bodyMarkdown: "תוספת שנייה" }),
    });
    const merged = await workflow.mergeWithExisting(second.id, record.id, TZACHI);
    expect(merged.version).toBe(2);
    const versions = versionsOf(await stores.versions.list(), record.id);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2]);
    expect(versions[1]?.previousVersionId).toBe(versions[0]?.id);
    expect(versions[1]?.changedFields).toContain("bodyMarkdown");
    // old version untouched
    expect(versions[0]?.snapshot.bodyMarkdown).toBe("גרסה ראשונה: תוכן");
  });

  it("compare(vA,vB) returns the field-level diff of the snapshots", async () => {
    const { stores, workflow, record } = await approvedBase();
    const second = await workflow.submitProposal({
      observationHe: "עדכון",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({ title: "עדכון להשוואה שונה", bodyMarkdown: "תוכן חדש להשוואה" }),
    });
    await workflow.mergeWithExisting(second.id, record.id, TZACHI);
    const [v1, v2] = versionsOf(await stores.versions.list(), record.id);
    const diff = compareVersions(v1!, v2!);
    expect(diff.map((d) => d.field)).toContain("bodyMarkdown");
    expect(compareVersions(v1!, v1!)).toEqual([]);
  });

  it("restore = NEW approved version via the proposal workflow (never a mutation)", async () => {
    const { stores, workflow, record } = await approvedBase();
    // v2 via merge
    const second = await workflow.submitProposal({
      observationHe: "עדכון",
      proposedById: "agent-memory",
      proposedByName: "סוכן זיכרון",
      draft: makeDraft({ title: "עדכון ביניים אחר", bodyMarkdown: "תוכן ביניים" }),
    });
    await workflow.mergeWithExisting(second.id, record.id, TZACHI);
    const v1 = versionsOf(await stores.versions.list(), record.id)[0]!;

    // restore v1 — goes through submit + human approve
    const restoreProposal = await submitRestoreProposal(workflow, stores, {
      recordId: record.id,
      versionId: v1.id,
      requestedById: TZACHI.deciderId,
      requestedByName: TZACHI.deciderName,
    });
    expect(restoreProposal.status).toBe("ממתין לאישור");
    const restored = await workflow.approve(restoreProposal.id, TZACHI);
    expect(restored.id).toBe(record.id);
    expect(restored.version).toBe(3);
    expect(restored.bodyMarkdown).toBe(v1.snapshot.bodyMarkdown);
    const versions = versionsOf(await stores.versions.list(), record.id);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
    // v2 still intact — restore appended, nothing was rewritten
    expect(versions[1]?.snapshot.bodyMarkdown).toContain("תוכן ביניים");
  });

  it("usage join: which envelope used which version", async () => {
    const { stores, clock, record } = await approvedBase();
    const version = latestVersion(await stores.versions.list(), record.id)!;
    await recordUsage(stores, clock, {
      envelopeId: "env-77",
      operation: "summarize.customer",
      recordId: record.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
    });
    const rows = usageJoinForRecord(await stores.usage.list(), await stores.versions.list(), record.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.usage.envelopeId).toBe("env-77");
    expect(rows[0]?.version?.id).toBe(version.id);
    expect(envelopesForVersion(await stores.usage.list(), version.id)).toEqual(["env-77"]);
    expect(envelopesForVersion(await stores.usage.list(), "לא-קיים")).toEqual([]);
  });
});
