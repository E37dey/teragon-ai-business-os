// W7-F — content bootstrap: idempotence, the exactly-5 guard, canonical
// titles/order, timing sums 600s, honest "טרם נמדד" rehearsal state, real
// demo-link routes, real backup-screenshot references with honesty notes,
// schema validity of every record, and presenter notes per section.
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/app/routes";
import {
  NOTE_DEFINITIONS,
  SECTION_DEFINITIONS,
  ensurePresentationContent,
  exactly5Sections,
  presentationSectionSchema,
  presenterNoteSchema,
  sumTargetSeconds,
  PRESENTATION_SECTION_TITLES,
} from "@/presentation";
import { fresh, freshBootstrapped } from "./helpers";

const APP_PATHS = new Set(APP_ROUTES.map((r) => r.path));

describe("ensurePresentationContent — idempotence", () => {
  it("creates records on the first run and NOTHING on the second", async () => {
    const { stores, clock } = fresh();
    const first = await ensurePresentationContent(stores, clock);
    expect(first.created).toBe(SECTION_DEFINITIONS.length + NOTE_DEFINITIONS.length);
    const second = await ensurePresentationContent(stores, clock);
    expect(second.created).toBe(0);
    expect((await stores.sections.list()).length).toBe(5);
    expect((await stores.notes.list()).length).toBe(NOTE_DEFINITIONS.length);
  });

  it("never overwrites a recorded rehearsal measurement on re-run", async () => {
    const { stores, clock } = await freshBootstrapped();
    const s = await stores.sections.get("ps-1");
    await stores.sections.update("ps-1", {
      timing: { ...s!.timing, actualRehearsalSeconds: 111, lastRehearsedAt: clock() },
    });
    await ensurePresentationContent(stores, clock);
    const after = await stores.sections.get("ps-1");
    expect(after?.timing.actualRehearsalSeconds).toBe(111);
  });
});

describe("exactly-5 guard + canonical structure", () => {
  it("bootstraps EXACTLY 5 sections with the mandated Hebrew titles in order", async () => {
    const { stores } = await freshBootstrapped();
    const sections = await stores.sections.list();
    const guard = exactly5Sections(sections);
    expect(guard.ok).toBe(true);
    expect(guard.count).toBe(5);
    const ordered = [...sections].sort((a, b) => a.order - b.order);
    expect(ordered.map((s) => s.titleHe)).toEqual([...PRESENTATION_SECTION_TITLES]);
  });

  it("fails the guard for 4 sections, duplicate ids, a wrong title and a broken sum", async () => {
    const { stores } = await freshBootstrapped();
    const sections = await stores.sections.list();
    // 4 sections
    expect(exactly5Sections(sections.slice(0, 4)).ok).toBe(false);
    // wrong title
    const wrongTitle = sections.map((s) =>
      s.order === 3 ? { ...s, titleHe: PRESENTATION_SECTION_TITLES[0] } : s,
    );
    expect(exactly5Sections(wrongTitle).ok).toBe(false);
    // broken timing sum
    const brokenSum = sections.map((s) =>
      s.order === 5 ? { ...s, timing: { ...s.timing, targetSeconds: 90 } } : s,
    );
    const verdict = exactly5Sections(brokenSum);
    expect(verdict.ok).toBe(false);
    expect(verdict.problemsHe.join(" ")).toContain("600");
  });

  it("timing: every section targets 120s and the total is exactly 600s (10 minutes)", async () => {
    const { stores } = await freshBootstrapped();
    const sections = await stores.sections.list();
    for (const s of sections) expect(s.timing.targetSeconds).toBe(120);
    expect(sumTargetSeconds(sections)).toBe(600);
  });

  it("honest rehearsal state: actualRehearsalSeconds starts null (⇒ טרם נמדד)", async () => {
    const { stores } = await freshBootstrapped();
    for (const s of await stores.sections.list()) {
      expect(s.timing.actualRehearsalSeconds).toBeNull();
      expect(s.timing.lastRehearsedAt).toBeNull();
    }
  });
});

describe("content honesty + reality of references", () => {
  it("every demo link points to a REAL app route", async () => {
    const { stores } = await freshBootstrapped();
    for (const s of await stores.sections.list()) {
      expect(APP_PATHS.has(s.demoLink.route)).toBe(true);
    }
  });

  it("every backup image references a real docs/screenshots file and carries an honesty note", async () => {
    const { stores } = await freshBootstrapped();
    for (const s of await stores.sections.list()) {
      expect(s.backupImage.sourceFile).toMatch(/^docs\/screenshots\/wave\d+\/.+\.png$/);
      expect(s.backupImage.honestyNoteHe.length).toBeGreaterThan(10);
      expect(s.backupImage.captionHe.length).toBeGreaterThan(3);
      // Wave-7 screens were not captured — the note must say what IS shown
      expect(s.backupImage.capturedWave).toBeLessThan(7);
    }
  });

  it("donor numbers are never presented as measured — the metrics section says יעד and טרם נמדד", async () => {
    const { stores } = await freshBootstrapped();
    const s5 = await stores.sections.get("ps-5");
    expect(s5?.mainMessageHe).toContain("טרם נמדד");
    const s5Notes = NOTE_DEFINITIONS.filter((n) => n.sectionId === "ps-5");
    const honesty = s5Notes.find((n) => n.emphasis === "הערת כנות");
    expect(honesty?.textHe).toContain("יעדי פיילוט");
  });

  it("every record validates against its zod schema", async () => {
    const { stores } = await freshBootstrapped();
    for (const s of await stores.sections.list()) {
      expect(() => presentationSectionSchema.parse(s)).not.toThrow();
    }
    for (const n of await stores.notes.list()) {
      expect(() => presenterNoteSchema.parse(n)).not.toThrow();
    }
  });

  it("every section has presenter notes, each with at least one מסר מרכזי or הערת כנות", async () => {
    const { stores } = await freshBootstrapped();
    const notes = await stores.notes.list();
    for (const sectionId of ["ps-1", "ps-2", "ps-3", "ps-4", "ps-5"]) {
      const sectionNotes = notes.filter((n) => n.sectionId === sectionId);
      expect(sectionNotes.length).toBeGreaterThanOrEqual(3);
      expect(sectionNotes.some((n) => n.emphasis !== "רגיל")).toBe(true);
    }
  });
});
