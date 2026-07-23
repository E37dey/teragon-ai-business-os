// W6-F — Phase 6.21 GAP-FILL: export secret leakage on a REAL generated
// export artifact.
//
// Existing coverage (tests/memory-import/export.test.ts) proves the selection
// gate, the redaction function and the manifest/audit in isolation. This file
// closes the remaining checklist gap: run the FULL runExport (vault → real ZIP
// bytes) with planted secrets + a sensitive-record sentinel + governance
// internals, then scan the actual output BYTES with the same pattern classes
// scripts/scan-bundle-secrets.mjs uses. If a secret shape or the
// system-prompt sentinel ever reaches the artifact, this fails.
import { describe, expect, it } from "vitest";
import type { MemoryRecordV2 } from "@/domain/memory";
import {
  EXPORT_REDACTED_HE,
  runExport,
  type RunExportResult,
} from "@/memory/export/exporter";
import { readZip } from "@/memory/zip/zip";
import { freshWorkflow, TZACHI } from "../memory/helpers";

// the exact secret shapes the bundle scanner hunts (scripts/scan-bundle-secrets.mjs)
const SECRET_SCAN_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/u,
  /AKIA[A-Z0-9]{12,}/u,
  /gh[pousr]_[A-Za-z0-9]{20,}/u,
  /xox[baprs]-[A-Za-z0-9-]{10,}/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/u, // JWT-like
];

// the server system-prompt policy sentinel (must NEVER appear in any artifact)
const SYSTEM_PROMPT_SENTINEL = "מדיניות מערכת (בלתי ניתנת לשינוי)";

const SENSITIVE_TITLE = "הסכם סודי — תנאי מחיר מיוחדים";
const SENSITIVE_BODY_SENTINEL = "SENSITIVE-BODY-SENTINEL-לא-לייצוא";

let seq = 0;
function record(overrides: Partial<MemoryRecordV2>): MemoryRecordV2 {
  seq += 1;
  return {
    id: `mrec-x-${seq}`,
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-21T08:00:00.000Z",
    organizationId: "org-teragon",
    title: `פריט ${seq}`,
    slug: `record-${seq}`,
    bodyMarkdown: "תוכן רגיל",
    plainText: "תוכן רגיל",
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
    verificationState: "מאומת",
    approvalState: "מאושר",
    confidence: {
      status: "unavailable",
      label: "טרם נמדד",
      method: "לא נמדד — אין נתונים",
      contributingSignals: [],
    },
    approvedAt: "2026-07-21T08:00:00.000Z",
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

/** decode every markdown file inside the export ZIP to one scannable string. */
async function decodeArtifact(result: RunExportResult): Promise<string> {
  const { entries } = await readZip(result.bytes);
  const dec = new TextDecoder();
  return entries.map((e) => `## ${e.path}\n${dec.decode(e.bytes)}`).join("\n");
}

function poisonedRecords(): MemoryRecordV2[] {
  return [
    record({
      title: "פריט עם סודות שתולים",
      bodyMarkdown: [
        "מפתח ספק: sk-proj-FAKE1234567890abcdef",
        "AWS: AKIAFAKEFAKEFAKE12",
        "GitHub: ghp_FAKEFAKEFAKEFAKEFAKEFAKE12345",
        "Slack: xoxb-1234567890-FAKEFAKE",
        "-----BEGIN PRIVATE KEY-----",
        "FAKEKEYBODY",
        "-----END PRIVATE KEY-----",
        "סיסמה: hunter2secret",
        "api_key = 'abcd1234efgh5678'",
      ].join("\n\n"),
    }),
    record({
      title: SENSITIVE_TITLE,
      sensitivity: "רגיש",
      bodyMarkdown: SENSITIVE_BODY_SENTINEL,
    }),
    record({ title: "פריט נקי", bodyMarkdown: "תוכן עסקי רגיל ללא סודות" }),
  ];
}

describe("W6-F GAP-FILL — real export artifact secret scan", () => {
  it("vault ZIP bytes contain ZERO secret shapes; every planted secret was redacted", async () => {
    const { stores, agents } = freshWorkflow();
    const records = poisonedRecords();
    const result = await runExport(
      {
        scope: { kind: "vault" },
        requestedById: TZACHI.deciderId,
        requestedByName: TZACHI.deciderName,
        download: false,
      },
      { stores, agentStores: agents, records },
    );

    const text = await decodeArtifact(result);
    for (const re of SECRET_SCAN_PATTERNS) {
      expect(text).not.toMatch(re);
    }
    // password / api_key assignments are gone too
    expect(text).not.toContain("hunter2secret");
    expect(text).not.toContain("abcd1234efgh5678");
    // redaction is visible + honestly counted in the manifest
    expect(text).toContain(EXPORT_REDACTED_HE);
    expect(result.manifest.redactionCount).toBeGreaterThanOrEqual(7);
  });

  it("sensitive record NEVER reaches the artifact without includeSensitive — and the exclusion is disclosed", async () => {
    const { stores, agents } = freshWorkflow();
    const result = await runExport(
      {
        scope: { kind: "vault" },
        requestedById: TZACHI.deciderId,
        requestedByName: TZACHI.deciderName,
        download: false,
      },
      { stores, agentStores: agents, records: poisonedRecords() },
    );
    const text = await decodeArtifact(result);
    expect(text).not.toContain(SENSITIVE_BODY_SENTINEL);
    expect(text).not.toContain(SENSITIVE_TITLE);
    const excluded = result.manifest.excluded.find((e) => e.title === SENSITIVE_TITLE);
    expect(excluded).toBeDefined();
    expect(excluded?.reasonHe).toContain("רגיש");
  });

  it("includeSensitive=true includes the record BUT still redacts secret shapes inside it", async () => {
    const { stores, agents } = freshWorkflow();
    const records = [
      record({
        title: SENSITIVE_TITLE,
        sensitivity: "רגיש",
        bodyMarkdown: `${SENSITIVE_BODY_SENTINEL}\n\nמפתח: sk-ant-FAKE987654321xyz`,
      }),
    ];
    const result = await runExport(
      {
        scope: { kind: "vault" },
        requestedById: TZACHI.deciderId,
        requestedByName: TZACHI.deciderName,
        options: { includeSensitive: true },
        download: false,
      },
      { stores, agentStores: agents, records },
    );
    const text = await decodeArtifact(result);
    expect(text).toContain(SENSITIVE_BODY_SENTINEL); // explicit human permission
    expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/u); // secrets still never leave
  });

  it("governance internals + system-prompt sentinel are NEVER serialized", async () => {
    const { stores, agents } = freshWorkflow();
    const result = await runExport(
      {
        scope: { kind: "vault" },
        requestedById: TZACHI.deciderId,
        requestedByName: TZACHI.deciderName,
        download: false,
      },
      { stores, agentStores: agents, records: poisonedRecords() },
    );
    const text = await decodeArtifact(result);
    expect(text).not.toContain(SYSTEM_PROMPT_SENTINEL);
    // the writer emits only the safe frontmatter fields — approval/audit
    // internals have no serialization path
    expect(text).not.toContain("approvalId");
    expect(text).not.toContain("approvedBy");
    expect(text).not.toContain("auditEvents");
    expect(text).not.toContain("confidence:");
  });

  it("HONEST LIMITATION (pinned): PII (email / phone) is NOT redacted by export — only secret shapes are", async () => {
    // There is no PII-redaction layer in Wave 6. This test pins the honest
    // current behavior so the limitation is documented and any future change
    // is deliberate. See docs/WAVE_6_SECURITY_REPORT.md → item 27.
    const { stores, agents } = freshWorkflow();
    const records = [
      record({
        title: "פריט עם פרטים אישיים",
        bodyMarkdown: "איש קשר: dana@example.co.il · טלפון 052-1234567",
      }),
    ];
    const result = await runExport(
      {
        scope: { kind: "vault" },
        requestedById: TZACHI.deciderId,
        requestedByName: TZACHI.deciderName,
        download: false,
      },
      { stores, agentStores: agents, records },
    );
    const text = await decodeArtifact(result);
    expect(text).toContain("dana@example.co.il");
    expect(text).toContain("052-1234567");
  });
});
