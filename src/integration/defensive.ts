// W6-E — defensive readers over W6-A/B/C governance records.
// The memory/knowledge/learning workstreams run in parallel and their concrete
// types are not visible to W6-E, so every cross-domain selector narrows
// unknown records field-by-field and NEVER throws on a shape mismatch.

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function str(value: unknown, key: string): string | null {
  const r = asRecord(value);
  const v = r?.[key];
  return typeof v === "string" ? v : null;
}

export function num(value: unknown, key: string): number | null {
  const r = asRecord(value);
  const v = r?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function strArray(value: unknown, key: string): string[] {
  const r = asRecord(value);
  const v = r?.[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function nested(value: unknown, key: string): Record<string, unknown> | null {
  const r = asRecord(value);
  return r ? asRecord(r[key]) : null;
}

/** "YYYY-MM-DD…" prefix comparison — updated/created today. */
export function isOnDay(iso: string | null, dayIso: string): boolean {
  return iso !== null && iso.slice(0, 10) === dayIso.slice(0, 10);
}

/** Pending-ish governance status (defensive across W6-A/B/C Hebrew unions). */
export function isPendingStatus(status: string | null): boolean {
  return status !== null && /ממתין|טיוטה|בבדיקה|הוגש/.test(status);
}

/** Approved-ish governance status. */
export function isApprovedStatus(status: string | null): boolean {
  return status !== null && /אושר|מאושר|פעיל/.test(status);
}
