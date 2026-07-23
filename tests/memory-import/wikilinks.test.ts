// W6-B — wikilink parsing (4 forms), resolution matrix (resolved /
// unresolved / ambiguous with the mandated Hebrew message / broken),
// and backlink recomputation across all 5 triggers.
import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_LINK_MESSAGE_HE,
  buildAliasIndex,
  computeBacklinks,
  extractWikiLinksDetailed,
  parseWikiLinkText,
  recomputeBacklinks,
  resolveWikiLink,
} from "@/memory/markdown/wikilinks";
import type { MemoryLink, MemoryRecordV2 } from "@/domain/memory";
import { freshWorkflow, makeDraft, seedSource, TZACHI } from "../memory/helpers";

function rec(over: Partial<MemoryRecordV2> & { id: string; title: string }): MemoryRecordV2 {
  return {
    createdAt: "2026-07-23T08:00:00.000Z",
    updatedAt: "2026-07-23T08:00:00.000Z",
    organizationId: "org-teragon",
    slug: over.title.toLowerCase().replace(/\s+/gu, "-"),
    bodyMarkdown: "",
    plainText: "",
    memoryLayer: "business",
    folder: "כללי",
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
    confidence: { label: "טרם נמדד", method: "none", contributingSignals: [], status: "unavailable" },
    approvedAt: null,
    approvedBy: null,
    version: 1,
    supersedesId: null,
    retentionPolicy: "קבוע",
    reviewDate: null,
    archivedAt: null,
    origin: "proposal",
    ...over,
  };
}

describe("wikilink parsing — 4 forms", () => {
  it("[[Title]]", () => {
    const wl = parseWikiLinkText("כותרת");
    expect(wl).toMatchObject({ target: "כותרת", display: "כותרת", section: null, blockRef: null });
  });
  it("[[Title|Display]]", () => {
    const wl = parseWikiLinkText("כותרת|תצוגה");
    expect(wl).toMatchObject({ target: "כותרת", display: "תצוגה" });
  });
  it("[[Title#Section]]", () => {
    const wl = parseWikiLinkText("כותרת#סעיף");
    expect(wl).toMatchObject({ target: "כותרת", section: "סעיף", blockRef: null });
  });
  it("[[Title#^block]]", () => {
    const wl = parseWikiLinkText("כותרת#^abc123");
    expect(wl).toMatchObject({ target: "כותרת", section: null, blockRef: "abc123" });
  });
  it("extracts all occurrences in order", () => {
    const links = extractWikiLinksDetailed("[[א]] וגם [[ב|בב]] וגם [[ג#ס]]");
    expect(links.map((l) => l.target)).toEqual(["א", "ב", "ג"]);
  });
});

describe("resolution matrix", () => {
  const target = rec({ id: "m-1", title: "לקוח חשוב" });
  const other = rec({ id: "m-2", title: "פתק אחר" });

  it("resolved — exactly one active match by title", () => {
    const r = resolveWikiLink("לקוח חשוב", [target, other]);
    expect(r.resolution).toBe("resolved");
    expect(r.resolvedRecordId).toBe("m-1");
    expect(r.messageHe).toBeNull();
  });

  it("resolved by slug", () => {
    const r = resolveWikiLink("לקוח  חשוב", [target, other]); // slugifies the same
    expect(r.resolution).toBe("resolved");
  });

  it("unresolved — no match", () => {
    const r = resolveWikiLink("לא קיים", [target, other]);
    expect(r.resolution).toBe("unresolved");
    expect(r.candidateIds).toEqual([]);
  });

  it("ambiguous — NEVER auto-picked; carries candidates + the Hebrew message", () => {
    const twin = rec({ id: "m-3", title: "לקוח חשוב" });
    const r = resolveWikiLink("לקוח חשוב", [target, twin]);
    expect(r.resolution).toBe("ambiguous");
    expect(r.resolvedRecordId).toBeNull();
    expect(r.candidateIds).toEqual(["m-1", "m-3"]);
    expect(r.messageHe).toBe("קיימות מספר התאמות — נדרשת בחירה");
    expect(r.messageHe).toBe(AMBIGUOUS_LINK_MESSAGE_HE);
  });

  it("broken — the only match is archived", () => {
    const gone = rec({ id: "m-4", title: "ישן", archivedAt: "2026-07-01" });
    const r = resolveWikiLink("ישן", [gone]);
    expect(r.resolution).toBe("broken");
  });

  it("resolves through the alias index", () => {
    const aliases = buildAliasIndex([{ recordId: "m-1", aliases: ["הלקוח"] }]);
    const r = resolveWikiLink("הלקוח", [target, other], aliases);
    expect(r.resolution).toBe("resolved");
    expect(r.resolvedRecordId).toBe("m-1");
  });
});

describe("computeBacklinks (pure)", () => {
  it("collects backlinks only from resolved links of active records", () => {
    const a = rec({ id: "a", title: "א" });
    const b = rec({ id: "b", title: "ב" });
    const archived = rec({ id: "c", title: "ג", archivedAt: "2026-07-01" });
    const link = (id: string, from: string, to: string | null, resolution: MemoryLink["resolution"]): MemoryLink => ({
      id,
      createdAt: "2026-07-23",
      updatedAt: "2026-07-23",
      fromRecordId: from,
      targetText: "x",
      resolution,
      resolvedRecordId: to,
      candidateIds: [],
    });
    const map = computeBacklinks(
      [a, b, archived],
      [link("l1", "a", "b", "resolved"), link("l2", "c", "b", "resolved"), link("l3", "b", null, "unresolved")],
    );
    expect(map.get("b")).toEqual(["a"]); // archived source "c" dropped
    expect(map.get("a")).toEqual([]);
  });
});

describe("recomputeBacklinks — the 5 triggers", () => {
  async function approveNote(
    bundle: ReturnType<typeof freshWorkflow>,
    title: string,
    body: string,
  ): Promise<MemoryRecordV2> {
    const source = await seedSource(bundle.stores);
    const proposal = await bundle.workflow.submitProposal({
      observationHe: `תצפית: ${title}`,
      proposedById: "u-tzachi",
      proposedByName: "צחי זוסטייהם",
      draft: makeDraft({ title, bodyMarkdown: body, sourceIds: [source.id] }),
    });
    return bundle.workflow.approve(proposal.id, TZACHI);
  }

  it("import/approve: link resolves + backlink caches after recompute", async () => {
    const bundle = freshWorkflow();
    const target = await approveNote(bundle, "פריט יעד", "תוכן היעד");
    const from = await approveNote(bundle, "פריט מקשר", "מפנה אל [[פריט יעד]]");
    const result = await recomputeBacklinks(bundle.stores);
    expect(result.linksUpdated).toBeGreaterThanOrEqual(0);
    const raw = await bundle.stores.records.get(target.id);
    expect((raw as MemoryRecordV2).backlinks).toContain(from.id);
  });

  it("rename: link to the old title becomes unresolved; backlink removed", async () => {
    const bundle = freshWorkflow();
    const target = await approveNote(bundle, "שם ישן", "תוכן");
    const from = await approveNote(bundle, "מקשר", "ראו [[שם ישן]]");
    await bundle.stores.records.update(target.id, { title: "שם חדש", slug: "שם-חדש" });
    const result = await recomputeBacklinks(bundle.stores);
    expect(result.linksUpdated).toBeGreaterThanOrEqual(1);
    const links = await bundle.stores.links.list();
    const link = links.find((l) => l.fromRecordId === from.id && l.targetText === "שם ישן");
    expect(link?.resolution).toBe("unresolved");
    const raw = (await bundle.stores.records.get(target.id)) as MemoryRecordV2;
    expect(raw.backlinks).not.toContain(from.id);
  });

  it("archive: link becomes broken; backlink removed", async () => {
    const bundle = freshWorkflow();
    const target = await approveNote(bundle, "פריט לארכוב", "תוכן");
    const from = await approveNote(bundle, "מקשר ב", "ראו [[פריט לארכוב]]");
    await bundle.stores.records.update(target.id, { archivedAt: bundle.clock() });
    await recomputeBacklinks(bundle.stores);
    const links = await bundle.stores.links.list();
    const link = links.find((l) => l.fromRecordId === from.id);
    expect(link?.resolution).toBe("broken");
    const raw = (await bundle.stores.records.get(target.id)) as MemoryRecordV2;
    expect(raw.backlinks).not.toContain(from.id);
  });

  it("supersede: link re-resolves to the successor record", async () => {
    const bundle = freshWorkflow();
    const old = await approveNote(bundle, "מדיניות אספקה", "גרסה ישנה");
    const from = await approveNote(bundle, "מזכיר", "ראו [[מדיניות אספקה]]");
    // supersede: archive the old record, approve a successor with the SAME title
    await bundle.stores.records.update(old.id, { archivedAt: bundle.clock(), title: "מדיניות אספקה (ישן)" });
    const successor = await approveNote(bundle, "מדיניות אספקה", "גרסה חדשה");
    await bundle.stores.records.update(successor.id, { supersedesId: old.id });
    await recomputeBacklinks(bundle.stores);
    const links = await bundle.stores.links.list();
    const link = links.find((l) => l.fromRecordId === from.id && l.targetText === "מדיניות אספקה");
    expect(link?.resolution).toBe("resolved");
    expect(link?.resolvedRecordId).toBe(successor.id);
    const raw = (await bundle.stores.records.get(successor.id)) as MemoryRecordV2;
    expect(raw.backlinks).toContain(from.id);
  });

  it("ambiguity after recompute keeps candidates and never auto-picks", async () => {
    const bundle = freshWorkflow();
    await approveNote(bundle, "נוהל", "אחד");
    const from = await approveNote(bundle, "מפנה", "ראו [[נוהל]]");
    // a second active record with the same title appears later
    const dup = await approveNote(bundle, "נוהל ב", "שניים");
    await bundle.stores.records.update(dup.id, { title: "נוהל", slug: "נוהל" });
    await recomputeBacklinks(bundle.stores);
    const links = await bundle.stores.links.list();
    const link = links.find((l) => l.fromRecordId === from.id && l.targetText === "נוהל");
    expect(link?.resolution).toBe("ambiguous");
    expect(link?.resolvedRecordId).toBeNull();
    expect(link?.candidateIds.length).toBe(2);
  });
});
