// TERAGON AI BUSINESS OS — staged secure Obsidian import (Wave 6, W6-B,
// Phase 6.6).
//
// file(s) selected → security scan → extraction (zip) → parse (frontmatter +
// safe markdown) → validation → duplicate detection → link analysis →
// user review (UI) → import as PROPOSALS ONLY via
// getMemoryEngine().workflow.submitProposal.
//
// NOTHING is ever approved by this pipeline: every imported note becomes a
// MemoryProposal waiting for a NAMED human in the canonical ApprovalEngine
// queue. The secured original file content is preserved ONLY on the
// MemorySource record (kind "external", refId "imported-markdown:<path>").
import type {
  MemoryImportJob,
  MemoryLayer,
  MemoryProposal,
  MemoryRecordV2,
  MemorySensitivity,
  MemorySource,
} from "@/domain/memory";
import { MEMORY_LAYERS, MEMORY_LAYER_LABELS_HE, MEMORY_SENSITIVITIES } from "@/domain/memory";
import type { MemoryStores } from "@/memory/repositories/memoryStores";
import type { AgentStores } from "@/repositories/agentStores";
import type { MemoryProposalWorkflow } from "@/memory/core/proposalWorkflow";
import { DUPLICATE_TITLE_THRESHOLD } from "@/memory/core/proposalWorkflow";
import { writeAudit, type Clock } from "@/agents/runlog";
import { slugify, titleSimilarity } from "@/memory/core/text";
import {
  FrontmatterError,
  parseFrontmatter,
  splitFrontmatter,
  type ParsedFrontmatter,
} from "@/memory/markdown/frontmatter";
import { parseObsidianMarkdown } from "@/memory/markdown/parser";
import type { ParsedMarkdown } from "@/memory/markdown/types";
import {
  buildAliasIndex,
  resolveWikiLink,
  type WikiLinkResolutionResult,
} from "@/memory/markdown/wikilinks";
import { readZip } from "@/memory/zip/zip";
import {
  IMPORT_MAX_FILES,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_MARKDOWN_CHARS,
  IMPORT_MAX_TOTAL_BYTES,
  IMPORT_ERROR_HE,
  MemoryImportError,
  isImageFileName,
  isMarkdownFileName,
  isZipFileName,
  type ImportErrorCode,
} from "./limits";

// ---------------------------------------------------------------------------
// stage vocabulary (UI renders these)
// ---------------------------------------------------------------------------

export const IMPORT_STAGES_HE = [
  "בחירת קבצים",
  "סריקת אבטחה",
  "חילוץ ותצוגה מקדימה",
  "פענוח Markdown",
  "אימות שדות",
  "איתור כפילויות",
  "ניתוח קישורים",
  "סקירת משתמש",
  "יצירת הצעות (ללא אישור)",
] as const;

// ---------------------------------------------------------------------------
// preview model
// ---------------------------------------------------------------------------

export interface ImportFileInput {
  name: string;
  bytes: Uint8Array;
}

export interface ImportRejection {
  path: string;
  code: ImportErrorCode | "FRONTMATTER";
  messageHe: string;
}

export interface StagedLink extends WikiLinkResolutionResult {
  target: string;
  /** the target matches another file inside THIS import batch */
  resolvesInBatch: boolean;
}

export interface StagedImportFile {
  /** path inside the selection/archive */
  path: string;
  fileName: string;
  /** the secured ORIGINAL content — persisted only on the MemorySource */
  originalContent: string;
  frontmatter: ParsedFrontmatter | null;
  body: string;
  parsed: ParsedMarkdown;
  title: string;
  slug: string;
  memoryLayer: MemoryLayer;
  folder: string;
  tags: string[];
  sensitivity: MemorySensitivity;
  reviewDate: string | null;
  /** true when raw HTML / dangerous URLs were neutralized */
  sanitized: boolean;
  sanitizedReasons: string[];
  /** entry name contained malformed UTF-8 (replaced safely) */
  malformedName: boolean;
  duplicates: { slugMatchIds: string[]; similarTitleIds: string[] };
  links: StagedLink[];
}

export interface ImportPreview {
  files: StagedImportFile[];
  rejections: ImportRejection[];
  /** images inside archives — recorded as non-executable references ONLY */
  imageRefs: string[];
  totalBytes: number;
  format: "markdown" | "zip";
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const LAYER_BY_LABEL: Record<string, MemoryLayer> = Object.fromEntries(
  Object.entries(MEMORY_LAYER_LABELS_HE).map(([k, v]) => [v, k as MemoryLayer]),
);

function toLayer(value: string | undefined): MemoryLayer {
  if (value && (MEMORY_LAYERS as readonly string[]).includes(value)) return value as MemoryLayer;
  if (value && LAYER_BY_LABEL[value]) return LAYER_BY_LABEL[value];
  return "business";
}

function toSensitivity(value: string | undefined): MemorySensitivity {
  if (value && (MEMORY_SENSITIVITIES as readonly string[]).includes(value)) {
    return value as MemorySensitivity;
  }
  return "פנימי";
}

function toReviewDate(value: string | undefined): string | null {
  if (value && /^\d{4}-\d{2}-\d{2}/u.test(value)) return value.slice(0, 10);
  return null;
}

function fileStem(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.(md|markdown)$/iu, "");
}

function firstHeading(parsed: ParsedMarkdown): string | null {
  for (const b of parsed.blocks) {
    if (b.kind === "heading") {
      const text = b.inline
        .map((s) => ("value" in s ? s.value : "display" in s ? s.display : ""))
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return null;
}

const HTML_TAG_RE = /<(\/?[a-zA-Z!][^>]*)>/gu;

/**
 * Neutralize raw HTML tags in the STORED body: ‹tag› instead of <tag> — the
 * text stays readable and honest, but can never be parsed as HTML anywhere.
 * The untouched original is preserved ONLY on the secured MemorySource.
 */
export function sanitizeRawHtml(body: string): string {
  return body.replace(HTML_TAG_RE, "‹$1›");
}

function decodeUtf8(bytes: Uint8Array): { text: string; malformed: boolean } {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return { text, malformed: text.includes("�") };
}

// ---------------------------------------------------------------------------
// prepare: stages 1–7 (everything before human review)
// ---------------------------------------------------------------------------

interface RawMarkdownFile {
  path: string;
  bytes: Uint8Array;
  malformedName: boolean;
}

export async function prepareImport(
  inputs: readonly ImportFileInput[],
  existingRecords: readonly MemoryRecordV2[],
): Promise<ImportPreview> {
  // stage 1 — selection
  if (inputs.length === 0) throw new MemoryImportError("EMPTY_SELECTION");

  // stage 2 — security scan (top level)
  const totalBytes = inputs.reduce((sum, f) => sum + f.bytes.length, 0);
  if (totalBytes > IMPORT_MAX_TOTAL_BYTES) throw new MemoryImportError("TOTAL_TOO_LARGE");

  const rejections: ImportRejection[] = [];
  const imageRefs: string[] = [];
  const mdFiles: RawMarkdownFile[] = [];
  let sawZip = false;

  const reject = (path: string, err: unknown): void => {
    if (err instanceof MemoryImportError) {
      rejections.push({ path: err.path ?? path, code: err.code, messageHe: err.message });
    } else if (err instanceof FrontmatterError) {
      rejections.push({ path, code: "FRONTMATTER", messageHe: err.message });
    } else {
      rejections.push({ path, code: "ZIP_MALFORMED", messageHe: IMPORT_ERROR_HE.ZIP_MALFORMED });
    }
  };

  // stage 3 — extraction
  for (const input of inputs) {
    if (isZipFileName(input.name)) {
      sawZip = true;
      try {
        const { entries } = await readZip(input.bytes);
        for (const entry of entries) {
          if (isMarkdownFileName(entry.path)) {
            mdFiles.push({ path: entry.path, bytes: entry.bytes, malformedName: entry.malformedName });
          } else if (isImageFileName(entry.path)) {
            // non-executable REFERENCE only — content is not previewed/fetched
            imageRefs.push(entry.path);
          } else {
            rejections.push({
              path: entry.path,
              code: "BINARY_REJECTED",
              messageHe: `${IMPORT_ERROR_HE.BINARY_REJECTED}: ${entry.path}`,
            });
          }
        }
      } catch (err) {
        reject(input.name, err);
      }
    } else if (isMarkdownFileName(input.name)) {
      mdFiles.push({ path: input.name, bytes: input.bytes, malformedName: false });
    } else {
      rejections.push({
        path: input.name,
        code: "EXTENSION_NOT_ALLOWED",
        messageHe: `${IMPORT_ERROR_HE.EXTENSION_NOT_ALLOWED}: ${input.name}`,
      });
    }
  }

  if (mdFiles.length > IMPORT_MAX_FILES) throw new MemoryImportError("TOO_MANY_FILES");

  // stages 4–5 — parse + validate
  const staged: StagedImportFile[] = [];
  for (const file of mdFiles) {
    try {
      if (file.bytes.length > IMPORT_MAX_FILE_BYTES) {
        throw new MemoryImportError("FILE_TOO_LARGE", file.path);
      }
      const { text, malformed } = decodeUtf8(file.bytes);
      if (text.length > IMPORT_MAX_MARKDOWN_CHARS) {
        throw new MemoryImportError("MARKDOWN_TOO_LONG", file.path);
      }
      const { frontmatterRaw, body } = splitFrontmatter(text);
      const frontmatter = frontmatterRaw !== null ? parseFrontmatter(frontmatterRaw) : null;
      const parsed = parseObsidianMarkdown(body);
      if (body.trim().length === 0) {
        throw new MemoryImportError("EMPTY_FILE", file.path);
      }
      const title = frontmatter?.fields.title?.trim() || firstHeading(parsed) || fileStem(file.path);
      const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
      staged.push({
        path: file.path,
        fileName: file.path.split("/").pop() ?? file.path,
        originalContent: text,
        frontmatter,
        body: parsed.sanitized ? sanitizeRawHtml(body) : body,
        parsed,
        title,
        slug: slugify(title),
        memoryLayer: toLayer(frontmatter?.fields.memory_layer),
        folder: frontmatter?.fields.folder?.trim() || dir || "ייבוא Obsidian",
        tags: [...new Set([...(frontmatter?.fields.tags ?? []), ...parsed.tags])],
        sensitivity: toSensitivity(frontmatter?.fields.sensitivity),
        reviewDate: toReviewDate(frontmatter?.fields.review_date),
        sanitized: parsed.sanitized,
        sanitizedReasons: parsed.sanitizedReasons,
        malformedName: file.malformedName || malformed,
        duplicates: { slugMatchIds: [], similarTitleIds: [] },
        links: [],
      });
    } catch (err) {
      reject(file.path, err);
    }
  }

  // stage 6 — duplicate detection (same deterministic rules as the workflow)
  const active = existingRecords.filter((r) => r.archivedAt === null);
  for (const f of staged) {
    f.duplicates.slugMatchIds = active.filter((r) => r.slug === f.slug).map((r) => r.id);
    f.duplicates.similarTitleIds = active
      .filter((r) => r.slug !== f.slug && titleSimilarity(r.title, f.title) >= DUPLICATE_TITLE_THRESHOLD)
      .map((r) => r.id);
  }

  // stage 7 — link analysis (existing records + batch aliases/titles).
  // Existing MemoryRecordV2 has no aliases field — aliases resolve only
  // within the import batch (documented in docs/OBSIDIAN_COMPATIBILITY.md).
  const aliasIndex = buildAliasIndex([]);
  const batchTitles = new Map<string, string>(); // slug → path
  for (const f of staged) {
    batchTitles.set(f.slug, f.path);
    for (const alias of f.frontmatter?.fields.aliases ?? []) {
      batchTitles.set(slugify(alias), f.path);
    }
  }
  for (const f of staged) {
    const seen = new Set<string>();
    for (const wl of f.parsed.wikilinks) {
      if (!wl.target || seen.has(wl.target)) continue;
      seen.add(wl.target);
      const res = resolveWikiLink(wl.target, active, aliasIndex, null);
      const inBatchPath = batchTitles.get(slugify(wl.target));
      f.links.push({
        target: wl.target,
        ...res,
        resolvesInBatch: inBatchPath !== undefined && inBatchPath !== f.path,
      });
    }
  }

  return {
    files: staged,
    rejections,
    imageRefs,
    totalBytes,
    format: sawZip ? "zip" : "markdown",
  };
}

// ---------------------------------------------------------------------------
// commit: stage 9 — PROPOSALS ONLY (after human review/selection in the UI)
// ---------------------------------------------------------------------------

export interface CommitImportDeps {
  stores: MemoryStores;
  agentStores: AgentStores;
  workflow: MemoryProposalWorkflow;
  clock?: Clock;
}

export interface CommitImportRequest {
  preview: ImportPreview;
  /** paths the human selected in the review stage */
  selectedPaths: readonly string[];
  requestedById: string;
  requestedByName: string;
}

export interface CommitImportResult {
  job: MemoryImportJob;
  proposals: MemoryProposal[];
  sources: MemorySource[];
  /** per-file submit failures (Hebrew) — honest, not silently dropped */
  failures: Array<{ path: string; messageHe: string }>;
}

export async function commitImport(
  request: CommitImportRequest,
  deps: CommitImportDeps,
): Promise<CommitImportResult> {
  const clock = deps.clock ?? ((): string => new Date().toISOString());
  const selected = request.preview.files.filter((f) => request.selectedPaths.includes(f.path));

  const existingJobs = await deps.stores.importJobs.list();
  const jobId = `mimp-${existingJobs.length + 1}`;
  const startTs = clock();
  let job: MemoryImportJob = await deps.stores.importJobs.create({
    id: jobId,
    createdAt: startTs,
    updatedAt: startTs,
    format: request.preview.format,
    status: "רץ",
    requestedById: request.requestedById,
    startedAt: startTs,
    endedAt: null,
    importedCount: 0,
    detailHe: `ייבוא ${selected.length} קבצים — יוצר הצעות בלבד (אישור אנושי נדרש לכל פריט)`,
  });

  const proposals: MemoryProposal[] = [];
  const sources: MemorySource[] = [];
  const failures: Array<{ path: string; messageHe: string }> = [];

  for (const file of selected) {
    try {
      const ts = clock();
      const existingSources = await deps.stores.sources.list();
      // the SECURED IMPORT RECORD: the only place the original content lives
      const source: MemorySource = await deps.stores.sources.create({
        id: `msrc-${existingSources.length + 1}`,
        createdAt: ts,
        updatedAt: ts,
        kind: "external",
        refId: `imported-markdown:${file.path}`,
        titleHe: `ייבוא Markdown: ${file.fileName}`,
        excerpt: file.originalContent,
        capturedAt: ts,
        verified: true, // the file content itself is held verbatim on this record
      });
      sources.push(source);

      const proposal = await deps.workflow.submitProposal({
        observationHe: `ייבוא Obsidian: «${file.title}» מתוך ${file.path}${file.sanitized ? " (עבר סניטציה)" : ""}`,
        proposedById: request.requestedById,
        proposedByName: request.requestedByName,
        draft: {
          title: file.title,
          slug: file.slug,
          bodyMarkdown: file.body,
          memoryLayer: file.memoryLayer,
          folder: file.folder,
          entityLinks: [],
          tags: file.tags,
          sourceIds: [source.id],
          sensitivity: file.sensitivity,
          retentionPolicy: "לסקירה תקופתית",
          reviewDate: file.reviewDate,
        },
      });
      proposals.push(proposal);
    } catch (err) {
      failures.push({ path: file.path, messageHe: err instanceof Error ? err.message : "יצירת ההצעה נכשלה" });
    }
  }

  const endTs = clock();
  job = await deps.stores.importJobs.update(jobId, {
    status: failures.length === selected.length && selected.length > 0 ? "נכשל" : "הושלם",
    endedAt: endTs,
    importedCount: proposals.length,
    updatedAt: endTs,
    detailHe:
      `נוצרו ${proposals.length} הצעות זיכרון (ממתינות לאישור אנושי) · ` +
      `0 פריטים נכתבו ישירות · ${failures.length} כשלונות · ` +
      `${request.preview.rejections.length} קבצים נדחו בסריקה`,
  });

  await writeAudit(deps.agentStores, jobId, clock, {
    actor: request.requestedById,
    action: "memory.import.submit",
    entityRef: `memoryImportJobs:${jobId}`,
    detailsHe:
      `ייבוא Obsidian (${request.preview.format}): ${proposals.length} הצעות נוצרו, ` +
      `${failures.length} כשלונות, ${request.preview.rejections.length} דחיות אבטחה. ` +
      `אף פריט לא אושר אוטומטית.`,
  });

  return { job, proposals, sources, failures };
}
