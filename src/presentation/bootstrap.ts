// TERAGON AI BUSINESS OS — idempotent bootstrap of the canonical presentation
// content into the presentationSections + presenterNotes collections (W7-F,
// 7.21). Stable ids ⇒ re-running creates nothing; a rehearsal measurement
// recorded by a person is NEVER overwritten. Every record is validated
// against the zod schemas before writing.
import { NOTE_DEFINITIONS, SECTION_DEFINITIONS } from "./content";
import { presentationSectionSchema, presenterNoteSchema } from "./schemas";
import type { PresentationClock, PresentationStores } from "./stores";
import type { Exactly5Result, PresentationSection, PresenterNote } from "./types";
import { PRESENTATION_SECTION_TITLES } from "./types";

export interface PresentationBootstrapResult {
  created: number;
}

/**
 * Idempotent: creates missing sections (ps-1..ps-5) and presenter notes
 * (pn-*), touching nothing that exists. actualRehearsalSeconds starts null —
 * the honest "טרם נמדד" until a real rehearsal run records a measurement.
 */
export async function ensurePresentationContent(
  stores: PresentationStores,
  clock: PresentationClock = () => new Date().toISOString(),
): Promise<PresentationBootstrapResult> {
  const now = clock();
  let created = 0;

  for (const def of SECTION_DEFINITIONS) {
    if (await stores.sections.get(def.id)) continue;
    const section: PresentationSection = {
      id: def.id,
      createdAt: now,
      updatedAt: now,
      order: def.order,
      key: def.key,
      titleHe: def.titleHe,
      objectiveHe: def.objectiveHe,
      mainMessageHe: def.mainMessageHe,
      visual: def.visual,
      visualDescriptionHe: def.visualDescriptionHe,
      demoLink: def.demoLink,
      backupImage: def.backupImage,
      timing: {
        targetSeconds: def.targetSeconds,
        // honest: no rehearsal happened yet ⇒ null ⇒ "טרם נמדד"
        actualRehearsalSeconds: null,
        lastRehearsedAt: null,
      },
      sourceNoteHe: def.sourceNoteHe,
      contentVersion: 1,
    };
    presentationSectionSchema.parse(section);
    await stores.sections.create(section);
    created += 1;
  }

  for (const def of NOTE_DEFINITIONS) {
    if (await stores.notes.get(def.id)) continue;
    const record: PresenterNote = {
      id: def.id,
      createdAt: now,
      updatedAt: now,
      sectionId: def.sectionId,
      order: def.order,
      textHe: def.textHe,
      emphasis: def.emphasis,
    };
    presenterNoteSchema.parse(record);
    await stores.notes.create(record);
    created += 1;
  }

  return { created };
}

/**
 * The exactly-5 structural guard (same contract shape as exactly7Personas):
 * exactly five sections, orders 1..5, the five mandated titles in order,
 * and target timing that sums to 600 seconds.
 */
export function exactly5Sections(sections: readonly PresentationSection[]): Exactly5Result {
  const problemsHe: string[] = [];
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  if (sorted.length !== 5) {
    problemsHe.push(`נדרשים בדיוק 5 שקפים — נמצאו ${sorted.length}`);
  }
  sorted.forEach((s, i) => {
    if (s.order !== i + 1) problemsHe.push(`סדר שקפים שבור: ${s.id} במיקום ${i + 1} עם order=${s.order}`);
  });
  if (sorted.length === 5) {
    sorted.forEach((s, i) => {
      if (s.titleHe !== PRESENTATION_SECTION_TITLES[i]) {
        problemsHe.push(`כותרת שקף ${i + 1} אינה הכותרת הקנונית: «${s.titleHe}»`);
      }
    });
    const total = sorted.reduce((sum, s) => sum + s.timing.targetSeconds, 0);
    if (total !== 600) problemsHe.push(`סך יעדי הזמן חייב להיות 600 שניות — נמצאו ${total}`);
  }
  const ids = new Set(sections.map((s) => s.id));
  if (ids.size !== sections.length) problemsHe.push("מזהי שקפים כפולים");
  return { ok: problemsHe.length === 0, count: sections.length, problemsHe };
}
