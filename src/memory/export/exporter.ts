// TERAGON AI BUSINESS OS — governed memory export (Wave 6, W6-B, Phase 6.7).
//
// Single note (.md) · selected bundle · full ZIP vault (store method — honest,
// no fake compression). Every export creates a MemoryExportJob + AuditEvent
// carrying requestedBy / included / excluded+reasons / generatedAt /
// sha-256 checksum / downloadState.
//
// EXCLUDED BY CONSTRUCTION (tested):
// - records at sensitivity רגיש/מוגבל unless includeSensitive was explicitly
//   set by the human requester
// - provider-secret patterns in bodies are redacted (never exported verbatim)
// - system prompts, internal authorization policy and private audit internals
//   are simply never serialized: the writer emits ONLY the safe frontmatter
//   fields + body + version identifier
import type { MemoryExportJob, MemoryRecordV2 } from "@/domain/memory";
import { SENSITIVITY_ORDER, MEMORY_LAYER_LABELS_HE } from "@/domain/memory";
import type { MemoryStores } from "@/memory/repositories/memoryStores";
import type { AgentStores } from "@/repositories/agentStores";
import { writeAudit, type Clock } from "@/agents/runlog";
import { writeZip, type ZipWriteEntry } from "@/memory/zip/zip";

export const MEMORY_EXPORT_VERSION = "teragon-memory-export/1";

// ---------------------------------------------------------------------------
// selection: the sensitivity gate + exclusion reasons
// ---------------------------------------------------------------------------

export interface ExportSelectionOptions {
  /** explicit human permission to include רגיש/מוגבל records */
  includeSensitive?: boolean;
}

export interface ExportExclusion {
  recordId: string;
  title: string;
  reasonHe: string;
}

export interface ExportSelection {
  included: MemoryRecordV2[];
  excluded: ExportExclusion[];
}

export function selectExportRecords(
  records: readonly MemoryRecordV2[],
  options: ExportSelectionOptions = {},
): ExportSelection {
  const included: MemoryRecordV2[] = [];
  const excluded: ExportExclusion[] = [];
  for (const r of records) {
    if (r.archivedAt !== null) {
      excluded.push({ recordId: r.id, title: r.title, reasonHe: "פריט בארכיון — לא מיוצא" });
      continue;
    }
    if (SENSITIVITY_ORDER[r.sensitivity] >= SENSITIVITY_ORDER["רגיש"] && !options.includeSensitive) {
      excluded.push({
        recordId: r.id,
        title: r.title,
        reasonHe: `רגישות "${r.sensitivity}" — מוחרג אלא אם ניתנה הרשאה מפורשת`,
      });
      continue;
    }
    included.push(r);
  }
  return { included, excluded };
}

// ---------------------------------------------------------------------------
// secret redaction — provider secrets never leave in an export
// ---------------------------------------------------------------------------

/** provider-secret / credential patterns redacted from exported bodies. */
export const EXPORT_SECRET_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/gu, // provider API keys
  /AKIA[A-Z0-9]{12,}/gu, // AWS access keys
  /gh[pousr]_[A-Za-z0-9]{20,}/gu, // GitHub tokens
  /xox[baprs]-[A-Za-z0-9-]{10,}/gu, // Slack tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
  /(?:password|סיסמה|סיסמא)\s*[:=]\s*\S+/giu,
  /(?:api[_-]?key|token|secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-.]{8,}['"]?/giu,
];

export const EXPORT_REDACTED_HE = "[הושמט בייצוא — דפוס סוד]";

export function redactSecrets(text: string): { text: string; redactionCount: number } {
  let out = text;
  let count = 0;
  for (const re of EXPORT_SECRET_PATTERNS) {
    out = out.replace(re, () => {
      count += 1;
      return EXPORT_REDACTED_HE;
    });
  }
  return { text: out, redactionCount: count };
}

// ---------------------------------------------------------------------------
// markdown serialization — ONLY safe fields, never governance internals
// ---------------------------------------------------------------------------

function yamlString(value: string): string {
  if (/^[\p{L}\p{N}][\p{L}\p{N} _.\-·«»]*$/u.test(value)) return value;
  return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`;
}

function yamlList(values: readonly string[]): string {
  return `[${values.map((v) => yamlString(v)).join(", ")}]`;
}

/**
 * Serialize one record to Obsidian-compatible markdown. Emits ONLY the
 * supported frontmatter fields + export version identifier. approvalId /
 * audit internals / confidence internals / authorization policy are NEVER
 * written.
 */
export function recordToMarkdown(record: MemoryRecordV2): { markdown: string; redactionCount: number } {
  const { text: body, redactionCount } = redactSecrets(record.bodyMarkdown);
  const lines: string[] = [
    "---",
    `id: ${yamlString(record.id)}`,
    `title: ${yamlString(record.title)}`,
    `tags: ${yamlList(record.tags)}`,
    `memory_layer: ${record.memoryLayer}`,
    `folder: ${yamlString(record.folder || "כללי")}`,
    `owner: ${yamlString(record.ownerName)}`,
    `sensitivity: ${record.sensitivity}`,
    `status: ${yamlString(record.verificationState)}`,
    `created: ${record.createdAt.slice(0, 10)}`,
    `updated: ${record.updatedAt.slice(0, 10)}`,
  ];
  if (record.reviewDate) lines.push(`review_date: ${record.reviewDate.slice(0, 10)}`);
  if (record.entityLinks.length > 0) {
    lines.push(`linked_entities: ${yamlList(record.entityLinks.map((l) => `${l.collection}:${l.entityId}`))}`);
  }
  if (record.sourceIds.length > 0) {
    lines.push(`sources: ${yamlList(record.sourceIds)}`);
  }
  lines.push(`export_version: ${MEMORY_EXPORT_VERSION}`, `record_version: ${record.version}`, "---", "", body, "");
  return { markdown: lines.join("\n"), redactionCount };
}

export function exportFileName(record: MemoryRecordV2): string {
  const safe = record.slug.replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 80) || record.id;
  return `${safe}.md`;
}

// ---------------------------------------------------------------------------
// checksum (sha-256 via crypto.subtle)
// ---------------------------------------------------------------------------

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as never);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// download seam — real browser download, injectable for tests
// ---------------------------------------------------------------------------

export type Downloader = (fileName: string, mime: string, bytes: Uint8Array) => void;

export const browserDownloader: Downloader = (fileName, mime, bytes) => {
  const blob = new Blob([bytes as never], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

export type ExportScope =
  | { kind: "single"; recordId: string }
  | { kind: "bundle"; recordIds: readonly string[] }
  | { kind: "vault" };

export interface ExportManifest {
  requestedById: string;
  requestedByName: string;
  scope: ExportScope["kind"];
  includedIds: string[];
  excluded: ExportExclusion[];
  redactionCount: number;
  generatedAt: string;
  checksumSha256: string;
  fileName: string;
  downloadState: "לא הורד" | "הורד";
  exportVersion: string;
}

export interface RunExportDeps {
  stores: MemoryStores;
  agentStores: AgentStores;
  /** all bridged records (caller loads via workflow.listBridgedRecords) */
  records: readonly MemoryRecordV2[];
  clock?: Clock;
  downloader?: Downloader;
}

export interface RunExportRequest {
  scope: ExportScope;
  requestedById: string;
  requestedByName: string;
  options?: ExportSelectionOptions;
  /** when false, build+record but skip the actual browser download */
  download?: boolean;
}

export interface RunExportResult {
  job: MemoryExportJob;
  manifest: ExportManifest;
  bytes: Uint8Array;
}

export class MemoryExportError extends Error {
  constructor(messageHe: string) {
    super(messageHe);
    this.name = "MemoryExportError";
  }
}

export async function runExport(request: RunExportRequest, deps: RunExportDeps): Promise<RunExportResult> {
  const clock = deps.clock ?? ((): string => new Date().toISOString());
  const startTs = clock();

  // scope → candidate records
  let candidates: MemoryRecordV2[];
  if (request.scope.kind === "single") {
    const one = deps.records.find((r) => r.id === (request.scope as { recordId: string }).recordId);
    if (!one) throw new MemoryExportError("הפריט המבוקש לייצוא לא נמצא");
    candidates = [one];
  } else if (request.scope.kind === "bundle") {
    const ids = (request.scope as { recordIds: readonly string[] }).recordIds;
    candidates = deps.records.filter((r) => ids.includes(r.id));
  } else {
    candidates = [...deps.records];
  }

  const { included, excluded } = selectExportRecords(candidates, request.options ?? {});

  // serialize
  let redactionCount = 0;
  const files: ZipWriteEntry[] = [];
  const enc = new TextEncoder();
  const usedPaths = new Set<string>();
  for (const record of included) {
    const { markdown, redactionCount: n } = recordToMarkdown(record);
    redactionCount += n;
    const layerDir = MEMORY_LAYER_LABELS_HE[record.memoryLayer];
    let path = `${layerDir}/${exportFileName(record)}`;
    if (usedPaths.has(path.toLowerCase())) {
      // slug collision — disambiguate honestly with the record id
      path = `${layerDir}/${exportFileName(record).replace(/\.md$/u, "")}-${record.id}.md`;
    }
    usedPaths.add(path.toLowerCase());
    files.push({ path, bytes: enc.encode(markdown) });
  }

  const generatedAt = clock();
  let bytes: Uint8Array;
  let fileName: string;
  let mime: string;
  if (request.scope.kind === "single" && included.length === 1 && included[0]) {
    bytes = files[0]?.bytes ?? new Uint8Array();
    fileName = exportFileName(included[0]);
    mime = "text/markdown";
  } else {
    bytes = writeZip(files, generatedAt);
    fileName = `teragon-memory-${generatedAt.slice(0, 10)}.zip`;
    mime = "application/zip";
  }
  const checksumSha256 = await sha256Hex(bytes);

  // job + audit
  const existingJobs = await deps.stores.exportJobs.list();
  const jobId = `mexp-${existingJobs.length + 1}`;
  const shouldDownload = request.download !== false;
  const downloadState: ExportManifest["downloadState"] = shouldDownload ? "הורד" : "לא הורד";

  const manifest: ExportManifest = {
    requestedById: request.requestedById,
    requestedByName: request.requestedByName,
    scope: request.scope.kind,
    includedIds: included.map((r) => r.id),
    excluded,
    redactionCount,
    generatedAt,
    checksumSha256,
    fileName,
    downloadState,
    exportVersion: MEMORY_EXPORT_VERSION,
  };

  const endTs = clock();
  const job: MemoryExportJob = await deps.stores.exportJobs.create({
    id: jobId,
    createdAt: startTs,
    updatedAt: endTs,
    format: request.scope.kind === "single" ? "markdown" : "zip",
    status: "הושלם",
    requestedById: request.requestedById,
    startedAt: startTs,
    endedAt: endTs,
    exportedCount: included.length,
    detailHe:
      `ייצוא ${included.length} פריטים (${request.scope.kind}) · ` +
      `${excluded.length} הוחרגו · ${redactionCount} השמטות סוד · ` +
      `checksum ${checksumSha256.slice(0, 12)}… · ${downloadState}`,
  });

  await writeAudit(deps.agentStores, jobId, clock, {
    actor: request.requestedById,
    action: "memory.export",
    entityRef: `memoryExportJobs:${jobId}`,
    detailsHe:
      `ייצוא זיכרון על ידי ${request.requestedByName} · כלולים: [${manifest.includedIds.join(", ")}] · ` +
      `הוחרגו: ${excluded.map((e) => `${e.recordId} (${e.reasonHe})`).join("; ") || "אין"} · ` +
      `נוצר: ${generatedAt} · sha256: ${checksumSha256} · מצב הורדה: ${downloadState}`,
  });

  if (shouldDownload) {
    (deps.downloader ?? browserDownloader)(fileName, mime, bytes);
  }

  return { job, manifest, bytes };
}
