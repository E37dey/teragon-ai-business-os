// W6-B — governed export: inclusion/exclusion (sensitivity gate), secret
// redaction, checksum stability, job + audit records, downloader seam,
// ZIP vault round-trip.
import { describe, expect, it } from "vitest";
import {
  MEMORY_EXPORT_VERSION,
  recordToMarkdown,
  redactSecrets,
  runExport,
  selectExportRecords,
  sha256Hex,
  type Downloader,
} from "@/memory/export/exporter";
import { obsidianStatus } from "@/memory/export/status";
import { readZip } from "@/memory/zip/zip";
import { splitFrontmatter, parseFrontmatter } from "@/memory/markdown/frontmatter";
import type { MemoryRecordV2 } from "@/domain/memory";
import { freshWorkflow, makeClock, makeDraft, seedSource, TZACHI } from "../memory/helpers";
import { dec } from "./helpers";

async function approveNote(
  bundle: ReturnType<typeof freshWorkflow>,
  title: string,
  body: string,
  sensitivity: MemoryRecordV2["sensitivity"] = "פנימי",
): Promise<MemoryRecordV2> {
  const source = await seedSource(bundle.stores);
  const p = await bundle.workflow.submitProposal({
    observationHe: title,
    proposedById: "u-tzachi",
    proposedByName: "צחי זוסטייהם",
    draft: makeDraft({ title, bodyMarkdown: body, sourceIds: [source.id], sensitivity }),
  });
  return bundle.workflow.approve(p.id, TZACHI);
}

describe("selectExportRecords — the sensitivity gate", () => {
  it("excludes רגיש/מוגבל with reasons unless explicitly permitted", async () => {
    const bundle = freshWorkflow();
    const pub = await approveNote(bundle, "פריט פנימי", "תוכן רגיל");
    const sens = await approveNote(bundle, "פריט רגיש", "פרטי קשר", "רגיש");
    const restricted = await approveNote(bundle, "פריט מוגבל", "שכר", "מוגבל");
    const all = [pub, sens, restricted];

    const gated = selectExportRecords(all);
    expect(gated.included.map((r) => r.id)).toEqual([pub.id]);
    expect(gated.excluded).toHaveLength(2);
    for (const ex of gated.excluded) expect(ex.reasonHe).toContain("רגישות");

    const permitted = selectExportRecords(all, { includeSensitive: true });
    expect(permitted.included).toHaveLength(3);
    expect(permitted.excluded).toHaveLength(0);
  });

  it("always excludes archived records", () => {
    const fake = { archivedAt: "2026-07-01" } as MemoryRecordV2;
    const r = selectExportRecords([{ ...fake, id: "x", title: "ארכיון", sensitivity: "ציבורי" } as MemoryRecordV2]);
    expect(r.included).toHaveLength(0);
    expect(r.excluded[0]?.reasonHe).toContain("ארכיון");
  });
});

describe("recordToMarkdown — safe serialization", () => {
  it("emits safe frontmatter + version identifiers; never governance internals", async () => {
    const bundle = freshWorkflow();
    const record = await approveNote(bundle, "פריט לייצוא", "תוכן עם [[קישור]] ו-**הדגשה**");
    const { markdown } = recordToMarkdown(record);
    expect(markdown).toContain("title:");
    expect(markdown).toContain(`memory_layer: ${record.memoryLayer}`);
    expect(markdown).toContain(`export_version: ${MEMORY_EXPORT_VERSION}`);
    expect(markdown).toContain("record_version: 1");
    expect(markdown).toContain("[[קישור]]");
    // NEVER exported: approval ids, confidence internals, audit internals
    expect(markdown).not.toContain("approvalId");
    expect(markdown).not.toContain("confidence");
    expect(markdown).not.toContain("runId");
    expect(markdown).not.toContain("system prompt");
    // round-trips through our own frontmatter parser
    const { frontmatterRaw } = splitFrontmatter(markdown);
    const parsed = parseFrontmatter(frontmatterRaw ?? "");
    expect(parsed.fields.title).toBe("פריט לייצוא");
  });

  it("redacts provider-secret patterns from the body", () => {
    const { text, redactionCount } = redactSecrets(
      "מפתח: sk-FAKEabc123def456 ועוד password: hunter22 וטקסט רגיל",
    );
    expect(redactionCount).toBe(2);
    expect(text).not.toContain("sk-FAKEabc123def456");
    expect(text).not.toContain("hunter22");
    expect(text).toContain("וטקסט רגיל");
  });
});

describe("runExport — job + audit + checksum + download seam", () => {
  it("vault export: job, audit, manifest, deterministic checksum, downloader called", async () => {
    const bundle = freshWorkflow();
    await approveNote(bundle, "פתק אחד", "תוכן אחד");
    await approveNote(bundle, "פתק רגיש", "סודי", "רגיש");
    const records = await bundle.workflow.listBridgedRecords();

    const downloads: Array<{ fileName: string; mime: string; size: number }> = [];
    const downloader: Downloader = (fileName, mime, bytes) => {
      downloads.push({ fileName, mime, size: bytes.length });
    };

    const run = (): ReturnType<typeof runExport> =>
      runExport(
        { scope: { kind: "vault" }, requestedById: "u-tzachi", requestedByName: "צחי זוסטייהם" },
        {
          stores: bundle.stores,
          agentStores: bundle.agents,
          records,
          clock: makeClock("2026-07-23T10:00:00.000Z"),
          downloader,
        },
      );

    const result = await run();
    expect(result.job.status).toBe("הושלם");
    expect(result.job.format).toBe("zip");
    expect(result.job.detailHe).toContain("checksum");
    expect(result.manifest.excluded.some((e) => e.reasonHe.includes("רגישות"))).toBe(true);
    expect(result.manifest.downloadState).toBe("הורד");
    expect(result.manifest.checksumSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.mime).toBe("application/zip");

    // audit record carries requester, inclusions, exclusions+reasons, sha256
    const audit = await bundle.agents.audit.list();
    const ev = audit.find((a) => a.action === "memory.export");
    expect(ev).toBeDefined();
    expect(ev?.details).toContain("צחי זוסטייהם");
    expect(ev?.details).toContain(result.manifest.checksumSha256);
    expect(ev?.details).toContain("רגישות");

    // checksum stability: identical clock ⇒ identical bytes ⇒ identical hash
    const again = await run();
    expect(again.manifest.checksumSha256).toBe(result.manifest.checksumSha256);
  });

  it("exported vault ZIP round-trips through our reader and excludes secrets", async () => {
    const bundle = freshWorkflow();
    await approveNote(bundle, "פתק עם סוד", "טקסט api_key: SECRETVALUE123 סוף");
    const records = await bundle.workflow.listBridgedRecords();
    const result = await runExport(
      { scope: { kind: "vault" }, requestedById: "u-tzachi", requestedByName: "צחי זוסטייהם", download: false },
      { stores: bundle.stores, agentStores: bundle.agents, records, clock: makeClock() },
    );
    expect(result.manifest.downloadState).toBe("לא הורד");
    const { entries } = await readZip(result.bytes);
    expect(entries.length).toBe(result.manifest.includedIds.length);
    const text = entries.map((e) => dec.decode(e.bytes)).join("\n");
    expect(text).not.toContain("SECRETVALUE123");
    expect(text).toContain("הושמט בייצוא");
  });

  it("single-note export produces a .md download", async () => {
    const bundle = freshWorkflow();
    const record = await approveNote(bundle, "פתק בודד", "תוכן הפתק");
    const records = await bundle.workflow.listBridgedRecords();
    const downloads: string[] = [];
    const result = await runExport(
      {
        scope: { kind: "single", recordId: record.id },
        requestedById: "u-tzachi",
        requestedByName: "צחי זוסטייהם",
      },
      {
        stores: bundle.stores,
        agentStores: bundle.agents,
        records,
        clock: makeClock(),
        downloader: (fileName) => downloads.push(fileName),
      },
    );
    expect(result.job.format).toBe("markdown");
    expect(downloads[0]).toMatch(/\.md$/u);
    expect(dec.decode(result.bytes)).toContain("תוכן הפתק");
  });

  it("sha256Hex is a real sha-256 (known vector)", async () => {
    const hash = await sha256Hex(new TextEncoder().encode("abc"));
    expect(hash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("obsidianStatus — the honest rail lines", () => {
  it("returns exactly the two mandated lines", () => {
    expect(obsidianStatus()).toEqual(["ייבוא וייצוא Obsidian פעיל", "גישה מקומית ישירה אינה פעילה"]);
  });
});
