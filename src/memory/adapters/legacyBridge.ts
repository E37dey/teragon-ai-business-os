// TERAGON AI BUSINESS OS — legacy MemoryRecord (Wave 1) → MemoryRecordV2
// bridge (Wave 6, W6-A). Legacy seed records remain readable forever: the
// adapter bridges them on read WITHOUT rewriting the store and WITHOUT
// inventing governance facts — origin "legacy-import", verification "לא נבדק",
// approvedBy null, honest unavailable confidence.
import type { MemoryRecord } from "@/domain/types";
import type { MemoryLayer, MemoryRecordV2 } from "@/domain/memory";
import { unavailableConfidence } from "@/domain/ai/envelope";
import { CEO_USER_ID } from "@/repositories/seed";
import { extractWikiLinks, slugify, stripMarkdown } from "@/memory/core/text";

export const CEO_NAME_HE = "צחי זוסטייהם";
export const DEFAULT_ORG_ID = "org-teragon";

/** Deterministic legacy-folder → layer mapping (default: business). */
export const LEGACY_FOLDER_LAYER: Record<string, MemoryLayer> = {
  לקוחות: "customer",
  עסקאות: "customer",
  לקחים: "agent_learning",
  החלטות: "business",
  תפעול: "technical",
};

export function legacyFolderToLayer(folder: string): MemoryLayer {
  return LEGACY_FOLDER_LAYER[folder] ?? "business";
}

/** Shape guard: a V2 record carries memoryLayer; legacy records do not. */
export function isMemoryRecordV2(record: MemoryRecord | MemoryRecordV2): record is MemoryRecordV2 {
  return typeof (record as MemoryRecordV2).memoryLayer === "string";
}

/**
 * Bridge one legacy record to V2. Honest by construction:
 * - approvalState "מאושר" reflects that seed memory is live demo content, but
 *   approvedBy/approvedAt stay null — no named approval is invented.
 * - verificationState "לא נבדק", confidence "unavailable" ("טרם נמדד").
 */
export function fromLegacyMemoryRecord(legacy: MemoryRecord): MemoryRecordV2 {
  const bodyMarkdown = legacy.markdown;
  return {
    id: legacy.id,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
    organizationId: DEFAULT_ORG_ID,
    title: legacy.title,
    slug: slugify(legacy.title),
    bodyMarkdown,
    plainText: stripMarkdown(bodyMarkdown),
    memoryLayer: legacyFolderToLayer(legacy.folder),
    folder: legacy.folder,
    entityLinks: [],
    tags: legacy.tags,
    wikiLinks: legacy.links.length > 0 ? legacy.links : extractWikiLinks(bodyMarkdown),
    backlinks: [],
    sourceIds: [],
    ownerId: CEO_USER_ID,
    ownerName: CEO_NAME_HE,
    sensitivity: "פנימי",
    verificationState: "לא נבדק",
    approvalState: "מאושר",
    confidence: unavailableConfidence("רשומת דור 1 — ביטחון לא נמדד"),
    approvedAt: null,
    approvedBy: null,
    version: 1,
    supersedesId: null,
    retentionPolicy: "קבוע",
    reviewDate: null,
    archivedAt: null,
    origin: "legacy-import",
  };
}
