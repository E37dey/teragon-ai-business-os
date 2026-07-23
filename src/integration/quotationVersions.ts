// W6-E — legacy quotation-version reader (the W3 localStorage workaround).
// The canonical home of the counter is now Quotation.version (m004). This lib
// exists so both the migration and the documents module read the SAME legacy
// key with the SAME defensive parsing. localStorage is NOT deleted this wave
// (rollback safety, per WAVE_6_DATA_MIGRATION_PLAN.md).
import type { QuotationX } from "./domainExtensions";

export const QUOTATION_VERSIONS_KEY = "teragon-w3.quotations.versions";

export type LegacyVersionMap = Record<string, number>;

export function loadLegacyVersions(
  storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined"
    ? null
    : localStorage,
): LegacyVersionMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(QUOTATION_VERSIONS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: LegacyVersionMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isInteger(v) && v >= 1) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Effective version: canonical field → legacy localStorage → 1. */
export function quotationVersion(q: QuotationX, legacy: LegacyVersionMap = {}): number {
  if (typeof q.version === "number" && q.version >= 1) return q.version;
  return legacy[q.id] ?? 1;
}
