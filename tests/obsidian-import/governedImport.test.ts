// S14.3 Phase 2 — governed manual import of an Obsidian note. Proves proposals-only,
// no destination mutation before approval, reject-safe, approve-once, duplicate-approval
// blocked, and honest new/changed/unchanged classification. Reuses the real pipeline.
import { describe, expect, it } from "vitest";
import { freshWorkflow, TZACHI } from "../memory/helpers";
import {
  classifyObsidianNote,
  createObsidianImportProposal,
  obsidianImportRefId,
  type ImportEngineDeps,
} from "@/integration/obsidian/obsidianImport";

const NOTE = { path: "Alpha Note.md", content: "# Alpha Note\n\nSynthetic content for governed import.\n" };

function deps(b: ReturnType<typeof freshWorkflow>): ImportEngineDeps {
  return { stores: b.stores, agentStores: b.agents, workflow: b.workflow };
}

describe("Obsidian governed import — proposals only, no destination mutation", () => {
  it("classifies a never-imported note as NEW", async () => {
    const b = freshWorkflow();
    const c = await classifyObsidianNote(NOTE.path, NOTE.content, b.stores);
    expect(c.status).toBe("new");
    expect(c.existingSourceId).toBeNull();
  });

  it("creates a pending proposal + secured source and does NOT mutate memoryRecords", async () => {
    const b = freshWorkflow();
    const recordsBefore = (await b.stores.records.list()).length;
    const job = await createObsidianImportProposal(NOTE, deps(b));
    expect(job.importedCount).toBe(1);

    const pending = (await b.stores.proposals.list()).filter((p) => p.status === "ממתין לאישור");
    expect(pending).toHaveLength(1);

    const source = (await b.stores.sources.list()).find((s) => s.refId === obsidianImportRefId(NOTE.path));
    expect(source).toBeTruthy();
    expect(source?.excerpt).toBe(NOTE.content); // full original preserved (source metadata)
    expect(source?.kind).toBe("external");

    expect((await b.stores.records.list()).length).toBe(recordsBefore); // NO record written

    const audit = await b.agents.audit.list();
    expect(audit.some((a) => a.action === "memory.import.submit")).toBe(true);
    expect(audit.some((a) => !!a.correlationId)).toBe(true); // correlation/trace preserved
  });

  it("classifies UNCHANGED for identical content and CHANGED after an edit", async () => {
    const b = freshWorkflow();
    await createObsidianImportProposal(NOTE, deps(b));
    expect((await classifyObsidianNote(NOTE.path, NOTE.content, b.stores)).status).toBe("unchanged");
    const changed = await classifyObsidianNote(NOTE.path, NOTE.content + "\n\nedited paragraph.\n", b.stores);
    expect(changed.status).toBe("changed");
    expect(changed.existingSourceId).toBeTruthy();
  });

  it("REJECT produces no memoryRecords mutation", async () => {
    const b = freshWorkflow();
    const before = (await b.stores.records.list()).length;
    await createObsidianImportProposal(NOTE, deps(b));
    const p = (await b.stores.proposals.list()).find((x) => x.status === "ממתין לאישור")!;
    await b.workflow.reject(p.id, TZACHI, "לא רלוונטי לידע המנוהל");
    expect((await b.stores.records.list()).length).toBe(before); // no new record
    expect((await b.stores.proposals.get(p.id))?.status).toBe("נדחה");
  });

  it("APPROVE creates exactly one governed record (+ immutable version); duplicate approval blocked", async () => {
    const b = freshWorkflow();
    const before = (await b.stores.records.list()).length;
    await createObsidianImportProposal(NOTE, deps(b));
    const p = (await b.stores.proposals.list()).find((x) => x.status === "ממתין לאישור")!;

    const record = await b.workflow.approve(p.id, TZACHI);
    expect(record.approvalState).toBe("מאושר");
    expect(record.approvedBy).toBe("צחי זוסטייהם");
    expect(record.version).toBe(1);
    expect((await b.stores.records.list()).length).toBe(before + 1); // exactly one new record

    const versions = await b.stores.versions.list();
    expect(versions.some((v) => v.recordId === record.id && v.versionNumber === 1)).toBe(true);

    // duplicate approval is blocked by the workflow state guard
    await expect(b.workflow.approve(p.id, TZACHI)).rejects.toBeTruthy();
    expect((await b.stores.records.list()).length).toBe(before + 1); // still exactly one
  });

  it("re-importing an UNCHANGED note is not a silent duplicate (classification gates the UI)", async () => {
    const b = freshWorkflow();
    await createObsidianImportProposal(NOTE, deps(b));
    const c = await classifyObsidianNote(NOTE.path, NOTE.content, b.stores);
    expect(c.status).toBe("unchanged");
    expect(c.existingSourceId).toBeTruthy();
  });
});
