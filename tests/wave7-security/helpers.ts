// W7-G (7.25) shared fixtures — a canonical SENSITIVE Wave-6 memory record
// (V2 shape, sensitivity "רגיש") used to probe every Wave-7 surface that
// might leak a sensitivity-gated body. The sentinel string must NEVER appear
// in any projection/serialization the Wave-7 surfaces produce.
import type { MemoryRecord } from "@/domain/types";
import type { MemoryRecordV2 } from "@/domain/memory";

export const SENSITIVE_BODY_SENTINEL = "W7G-SENSITIVE-BODY-סודי-אסור-שיודלף";

export const NOW = "2026-07-23T12:00:00.000Z";

/** A full V2 memory record with sensitivity "רגיש" and a sentinel body. */
export function makeSensitiveMemoryV2(overrides: Partial<MemoryRecordV2> = {}): MemoryRecordV2 {
  return {
    id: "mrec-w7g-sensitive",
    createdAt: NOW,
    updatedAt: NOW,
    organizationId: "org-teragon",
    title: "רשומת זיכרון רגישה (בדיקת W7-G)",
    slug: "w7g-sensitive",
    bodyMarkdown: SENSITIVE_BODY_SENTINEL,
    plainText: SENSITIVE_BODY_SENTINEL,
    memoryLayer: "business",
    folder: "בדיקות",
    entityLinks: [],
    tags: [],
    wikiLinks: [],
    backlinks: [],
    sourceIds: [],
    ownerId: "u-tzachi",
    ownerName: "צחי זוסטייהם",
    sensitivity: "רגיש",
    verificationState: "מאומת",
    approvalState: "מאושר",
    confidence: {
      label: "טרם נמדד",
      method: "לא נמדד — קבוע בדיקה",
      contributingSignals: [],
      status: "unavailable",
    },
    approvedAt: NOW,
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

/** The same record cast to the legacy collection element type the
 *  stage-gate/submission contexts consume (both shapes share the store). */
export function asLegacyCollectionRecord(rec: MemoryRecordV2): MemoryRecord {
  return rec as unknown as MemoryRecord;
}
