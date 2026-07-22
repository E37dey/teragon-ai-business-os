// Wave 3 shared formatting helpers (module-local, pure — unit tested).

/** "12,345 ₪" — ILS with Hebrew locale grouping, no decimals. */
export function ils(n: number): string {
  return `${Math.round(n).toLocaleString("he-IL")} ₪`;
}

/** "22.07.2026" from an ISO date/datetime string. */
export function dateHe(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "22.07 14:30" short datetime. */
export function dateTimeHe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "YYYY-MM-DD" of today (local). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** whole days from today to `iso` (negative = past). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const target = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  const base = new Date(todayIso(now) + "T00:00:00");
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}
