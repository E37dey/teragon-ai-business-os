// W6-B — staged secure import: frontmatter mapping, sanitization split
// (original ONLY on the secured source), duplicates, link analysis,
// PROPOSALS-ONLY commit (direct approve-bypass fails), vault adapter.
import { describe, expect, it } from "vitest";
import { prepareImport, commitImport } from "@/memory/import/pipeline";
import { ObsidianVaultAdapter } from "@/memory/import/vaultAdapter";
import { writeZip } from "@/memory/zip/zip";
import { AMBIGUOUS_LINK_MESSAGE_HE } from "@/memory/markdown/wikilinks";
import { freshWorkflow, makeDraft, seedSource, TZACHI } from "../memory/helpers";
import { enc, md } from "./helpers";

const OBS_NOTE = [
  "---",
  "title: העדפת לקוח",
  "tags: [ייבוא]",
  "memory_layer: customer",
  "sensitivity: פנימי",
  "review_date: 2026-12-01",
  "unknown_field: metadata-only",
  "---",
  "# העדפת לקוח",
  "",
  "ערוץ מועדף: אימייל",
  "",
  "ראו [[פריט קיים]] וגם #תגית",
].join("\n");

describe("prepareImport — staged pipeline", () => {
  it("maps frontmatter → staged fields; unknown keys stay metadata-only", async () => {
    const preview = await prepareImport([md("לקוחות/note.md", OBS_NOTE)], []);
    expect(preview.files).toHaveLength(1);
    const f = preview.files[0]!;
    expect(f.title).toBe("העדפת לקוח");
    expect(f.memoryLayer).toBe("customer");
    expect(f.sensitivity).toBe("פנימי");
    expect(f.reviewDate).toBe("2026-12-01");
    expect(f.tags).toContain("ייבוא");
    expect(f.tags).toContain("תגית");
    expect(f.frontmatter?.extensions.unknown_field).toBe("metadata-only");
    // unknown fields never control behavior — defaults stay defaults
    expect(f.folder).toBe("לקוחות");
  });

  it("keeps the ORIGINAL (with raw HTML) only for the secured source; draft body is sanitized", async () => {
    const dirty = "# פתק\n\nטקסט <script>evil()</script> נקי";
    const preview = await prepareImport([md("dirty.md", dirty)], []);
    const f = preview.files[0]!;
    expect(f.sanitized).toBe(true);
    expect(f.originalContent).toContain("<script>");
    expect(f.body).not.toContain("<script>");
    expect(f.body).toContain("‹script›");
  });

  it("detects duplicates against existing records (slug + similar title)", async () => {
    const bundle = freshWorkflow();
    const source = await seedSource(bundle.stores);
    const proposal = await bundle.workflow.submitProposal({
      observationHe: "קיים",
      proposedById: "u-tzachi",
      proposedByName: "צחי זוסטייהם",
      draft: makeDraft({ title: "נוהל אספקה מהיר", sourceIds: [source.id] }),
    });
    await bundle.workflow.approve(proposal.id, TZACHI);
    const records = await bundle.workflow.listBridgedRecords();
    const preview = await prepareImport([md("dup.md", "# נוהל אספקה מהיר\nתוכן")], records);
    expect(preview.files[0]?.duplicates.slugMatchIds.length).toBeGreaterThan(0);
  });

  it("link analysis: ambiguous carries the mandated Hebrew message; batch links marked", async () => {
    const bundle = freshWorkflow();
    const source = await seedSource(bundle.stores);
    for (const title of ["מדריך הפעלה", "מדריך הפעלה ב"]) {
      const p = await bundle.workflow.submitProposal({
        observationHe: title,
        proposedById: "u-tzachi",
        proposedByName: "צחי זוסטייהם",
        draft: makeDraft({ title, sourceIds: [source.id] }),
      });
      await bundle.workflow.approve(p.id, TZACHI);
    }
    // force ambiguity: same title on both
    const records = (await bundle.workflow.listBridgedRecords()).map((r) => ({ ...r, title: "מדריך הפעלה", slug: "מדריך-הפעלה" }));
    const preview = await prepareImport(
      [md("a.md", "ראו [[מדריך הפעלה]] וגם [[חבר בקבוצה]]"), md("b.md", "# חבר בקבוצה\nתוכן")],
      records,
    );
    const links = preview.files.find((f) => f.path === "a.md")?.links ?? [];
    const ambiguous = links.find((l) => l.target === "מדריך הפעלה");
    expect(ambiguous?.resolution).toBe("ambiguous");
    expect(ambiguous?.messageHe).toBe(AMBIGUOUS_LINK_MESSAGE_HE);
    expect(ambiguous?.candidateIds.length).toBeGreaterThan(1);
    const inBatch = links.find((l) => l.target === "חבר בקבוצה");
    expect(inBatch?.resolvesInBatch).toBe(true);
  });

  it("extracts markdown from a ZIP and records images as references only", async () => {
    const zip = writeZip(
      [
        { path: "כללי/note.md", bytes: enc.encode("# מהארכיון\nתוכן") },
        { path: "assets/logo.png", bytes: new Uint8Array([1, 2, 3]) },
      ],
      "2026-07-23T08:00:00.000Z",
    );
    const preview = await prepareImport([{ name: "vault.zip", bytes: zip }], []);
    expect(preview.format).toBe("zip");
    expect(preview.files.map((f) => f.path)).toEqual(["כללי/note.md"]);
    expect(preview.imageRefs).toEqual(["assets/logo.png"]);
  });

  it("rejects non-image binary inside a zip with a clear message (no silent skip)", async () => {
    const zip = writeZip(
      [
        { path: "note.md", bytes: enc.encode("# א\nב") },
        { path: "doc.pdf", bytes: new Uint8Array([0x25, 0x50]) },
      ],
      "2026-07-23T08:00:00.000Z",
    );
    const preview = await prepareImport([{ name: "v.zip", bytes: zip }], []);
    expect(preview.rejections.some((r) => r.code === "BINARY_REJECTED" && r.path === "doc.pdf")).toBe(true);
  });
});

describe("commitImport — proposals ONLY", () => {
  it("creates job + sources + pending proposals; nothing is approved", async () => {
    const bundle = freshWorkflow();
    const recordsBefore = await bundle.stores.records.list();
    const preview = await prepareImport([md("note.md", OBS_NOTE)], await bundle.workflow.listBridgedRecords());
    const result = await commitImport(
      {
        preview,
        selectedPaths: ["note.md"],
        requestedById: "u-tzachi",
        requestedByName: "צחי זוסטייהם",
      },
      { stores: bundle.stores, agentStores: bundle.agents, workflow: bundle.workflow, clock: bundle.clock },
    );
    expect(result.job.status).toBe("הושלם");
    expect(result.job.importedCount).toBe(1);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.status).toBe("ממתין לאישור");
    // the secured original lives on the source record
    expect(result.sources[0]?.refId).toBe("imported-markdown:note.md");
    expect(result.sources[0]?.excerpt).toBe(OBS_NOTE);
    // NO record was written
    const recordsAfter = await bundle.stores.records.list();
    expect(recordsAfter.length).toBe(recordsBefore.length);
    // audit trail exists
    const audit = await bundle.agents.audit.list();
    expect(audit.some((a) => a.action === "memory.import.submit")).toBe(true);
  });

  it("direct approve-bypass fails: execute without a decision throws", async () => {
    const bundle = freshWorkflow();
    const preview = await prepareImport([md("note.md", OBS_NOTE)], []);
    const { proposals } = await commitImport(
      { preview, selectedPaths: ["note.md"], requestedById: "u-x", requestedByName: "גורם" },
      { stores: bundle.stores, agentStores: bundle.agents, workflow: bundle.workflow, clock: bundle.clock },
    );
    const p = proposals[0]!;
    await expect(
      bundle.workflow.engine.execute(p.runId, p.approvalId ?? "", "u-x"),
    ).rejects.toThrowError(/AGENT_EXECUTION_WITHOUT_APPROVAL|אישור/u);
  });

  it("an imported proposal lands in memory ONLY after a named human approves", async () => {
    const bundle = freshWorkflow();
    const preview = await prepareImport([md("note.md", OBS_NOTE)], []);
    const { proposals } = await commitImport(
      { preview, selectedPaths: ["note.md"], requestedById: "u-tzachi", requestedByName: "צחי זוסטייהם" },
      { stores: bundle.stores, agentStores: bundle.agents, workflow: bundle.workflow, clock: bundle.clock },
    );
    const record = await bundle.workflow.approve(proposals[0]!.id, TZACHI);
    expect(record.approvalState).toBe("מאושר");
    expect(record.approvedBy).toBe("צחי זוסטייהם");
    expect(record.title).toBe("העדפת לקוח");
  });
});

describe("ObsidianVaultAdapter (the W6-A seam)", () => {
  it("importVault runs the full pipeline and returns a finished job", async () => {
    const bundle = freshWorkflow();
    const adapter = new ObsidianVaultAdapter({
      stores: bundle.stores,
      agentStores: bundle.agents,
      workflow: bundle.workflow,
      requestedById: "u-tzachi",
      requestedByName: "צחי זוסטייהם",
      clock: bundle.clock,
    });
    const job = await adapter.importVault([{ path: "a.md", content: "# פתק א\nתוכן" }]);
    expect(job.status).toBe("הושלם");
    expect(job.importedCount).toBe(1);
    const proposals = await bundle.stores.proposals.list();
    expect(proposals.filter((p) => p.status === "ממתין לאישור")).toHaveLength(1);
  });
});
