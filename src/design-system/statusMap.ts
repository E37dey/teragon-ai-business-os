// Canonical status → color mapping (docs/VISUAL_DNA.md pattern 4).
// Separated from StatusChip.tsx so the component file only exports components (fast-refresh).
import type { OsStatus } from "./types";

export interface StatusMeta {
  tone: "success" | "blue" | "cyan" | "violet" | "warning" | "danger" | "muted";
  warn?: boolean;
}

/** Each status has exactly one color across the whole product. */
export const STATUS_MAP: Record<OsStatus, StatusMeta> = {
  פעיל: { tone: "success" },
  ממתין: { tone: "blue" },
  "דורש אישור": { tone: "violet" },
  חסום: { tone: "danger" },
  מושבת: { tone: "muted" },
  הושלם: { tone: "success" },
  אזהרה: { tone: "warning", warn: true },
  מושהה: { tone: "danger" },
};
