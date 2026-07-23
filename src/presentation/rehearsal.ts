// TERAGON AI BUSINESS OS — rehearsal measurement (W7-F, 7.22). A rehearsal
// records REAL elapsed seconds per section into the presentationSections
// collection — never fabricated: the number comes from actual clock time
// spent on the section while rehearsal mode was active. Until then the
// timing renders "טרם נמדד".
import type { PresentationClock, PresentationStores } from "./stores";
import type { PresentationSection } from "./types";

/** In-flight rehearsal for ONE section (pure value — page state holds it). */
export interface RehearsalRun {
  sectionId: string;
  /** ms timestamp when the presenter entered the section */
  startedAtMs: number;
}

export function beginRehearsalSection(sectionId: string, nowMs: number): RehearsalRun {
  return { sectionId, startedAtMs: nowMs };
}

/**
 * Elapsed whole seconds of the run — REAL measurement, floor ≥ 1 second so a
 * completed pass is never recorded as 0 (which would read as "instant").
 */
export function rehearsalSeconds(run: RehearsalRun, nowMs: number): number {
  return Math.max(1, Math.round((nowMs - run.startedAtMs) / 1000));
}

/**
 * Persist a measured rehearsal into the section record. Guards:
 * - refuses non-positive / non-finite values (nothing fabricated, no zeroing);
 * - unknown section id is an error (measurement must land somewhere real).
 */
export async function recordRehearsalSeconds(
  stores: PresentationStores,
  sectionId: string,
  measuredSeconds: number,
  clock: PresentationClock = () => new Date().toISOString(),
): Promise<PresentationSection> {
  if (!Number.isFinite(measuredSeconds) || measuredSeconds <= 0) {
    throw new Error(`recordRehearsalSeconds: מדידה לא חוקית (${measuredSeconds}) — אין מה לרשום`);
  }
  const section = await stores.sections.get(sectionId);
  if (!section) {
    throw new Error(`recordRehearsalSeconds: שקף ${sectionId} לא קיים`);
  }
  const now = clock();
  return stores.sections.update(sectionId, {
    updatedAt: now,
    timing: {
      ...section.timing,
      actualRehearsalSeconds: Math.round(measuredSeconds),
      lastRehearsedAt: now,
    },
  });
}

/** Clear all rehearsal measurements (an explicit user action — not automatic). */
export async function clearRehearsalMeasurements(
  stores: PresentationStores,
  clock: PresentationClock = () => new Date().toISOString(),
): Promise<number> {
  const sections = await stores.sections.list();
  const now = clock();
  let cleared = 0;
  for (const s of sections) {
    if (s.timing.actualRehearsalSeconds === null) continue;
    await stores.sections.update(s.id, {
      updatedAt: now,
      timing: { ...s.timing, actualRehearsalSeconds: null, lastRehearsedAt: null },
    });
    cleared += 1;
  }
  return cleared;
}
