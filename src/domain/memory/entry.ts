// S13.4 — MemoryEntry: the real, ungoverned local-memory record (PR D).
// A plain CRUD note persisted in IndexedDB via the existing repository infra.
// Distinct from the governed MemoryRecord/MemoryRecordV2 system (proposals +
// approvals + immutable versions) — this is a durable, searchable, org-scoped
// personal/organizational memory. Synthetic/local only; no Obsidian, no cloud.
import { z } from "zod";
import type { BaseEntity } from "@/domain/types";

export const MEMORY_CATEGORIES = ["NOTE", "DECISION", "PROCESS", "LEARNING", "AGENT_FINDING"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_ENTRY_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type MemoryEntryStatus = (typeof MEMORY_ENTRY_STATUSES)[number];

export const MEMORY_CATEGORY_LABELS_HE: Record<MemoryCategory, string> = {
  NOTE: "הערה",
  DECISION: "החלטה",
  PROCESS: "תהליך",
  LEARNING: "לקח",
  AGENT_FINDING: "ממצא סוכן",
};

export const MEMORY_STATUS_LABELS_HE: Record<MemoryEntryStatus, string> = {
  ACTIVE: "פעיל",
  ARCHIVED: "בארכיון",
};

export interface MemoryEntry extends BaseEntity {
  /** organization scope — always a non-empty id; cross-org reads are blocked. */
  organizationId: string;
  title: string;
  content: string;
  category: MemoryCategory;
  tags: readonly string[];
  /** provenance, e.g. "user" or "agent-proposal" (writes still require the user). */
  source: string;
  status: MemoryEntryStatus;
}

export const memoryEntrySchema: z.ZodType<MemoryEntry> = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  organizationId: z.string().min(1),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20000),
  category: z.enum(MEMORY_CATEGORIES),
  tags: z.array(z.string().min(1).max(40)).max(20).readonly(),
  source: z.string().min(1).max(60),
  status: z.enum(MEMORY_ENTRY_STATUSES),
});

/** User-supplied create/edit input (org/id/timestamps/status are added by the repo). */
export interface MemoryEntryInput {
  title: string;
  content: string;
  category: MemoryCategory;
  tags?: readonly string[];
  source?: string;
}

export const memoryEntryInputSchema = z.object({
  title: z.string().trim().min(1, "יש להזין כותרת").max(200),
  content: z.string().trim().min(1, "יש להזין תוכן").max(20000),
  category: z.enum(MEMORY_CATEGORIES),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  source: z.string().trim().max(60).optional(),
});
