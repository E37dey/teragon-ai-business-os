// rankedSearch — deterministic ranking + field matching over the seed.
import { describe, expect, it } from "vitest";
import { classifyMatch, rankedSearch, type RankedSearchData } from "@/domain/selectors";
import {
  COURSES,
  CUSTOMER_PRINTERS,
  CUSTOMERS,
  DOCUMENTS,
  KNOWLEDGE_NOTES,
  LEADS,
  MEMORY_RECORDS,
  ORGANIZATIONS,
  PRINTER_MODELS,
  QUOTATIONS,
  SERVICE_TICKETS,
  STUDENTS,
  TASKS,
} from "@/repositories/seed";

const DATA: RankedSearchData = {
  customers: CUSTOMERS,
  leads: LEADS,
  organizations: ORGANIZATIONS,
  quotations: QUOTATIONS,
  printerModels: PRINTER_MODELS,
  customerPrinters: CUSTOMER_PRINTERS,
  courses: COURSES,
  students: STUDENTS,
  tickets: SERVICE_TICKETS,
  tasks: TASKS,
  documents: DOCUMENTS,
  knowledgeNotes: KNOWLEDGE_NOTES,
  memoryRecords: MEMORY_RECORDS,
};

describe("classifyMatch", () => {
  it("exact > startsWith > contains > null", () => {
    expect(classifyMatch("bambu lab a1", "Bambu Lab A1")).toBe("exact");
    expect(classifyMatch("bambu", "Bambu Lab A1")).toBe("startsWith");
    expect(classifyMatch("lab", "Bambu Lab A1")).toBe("contains");
    expect(classifyMatch("prusa", "Bambu Lab A1")).toBeNull();
    expect(classifyMatch("", "Bambu")).toBeNull();
  });
});

describe("rankedSearch — field matching", () => {
  it('"Bambu" finds printer models with the matched-field label', () => {
    const hits = rankedSearch(DATA, "Bambu");
    const printerHit = hits.find((h) => h.kind === "דגם מדפסת");
    expect(printerHit).toBeDefined();
    expect(printerHit?.route).toBe("/printers");
    expect(printerHit?.matchedField).toBe("שם דגם");
  });

  it("finds an English serial number (customer printer)", () => {
    const hits = rankedSearch(DATA, "BL-X1C-20417");
    expect(hits[0]?.kind).toBe("מדפסת לקוח");
    expect(hits[0]?.matchType).toBe("exact");
    expect(hits[0]?.matchedField).toBe("מספר סידורי");
  });

  it("finds a phone number and labels the match", () => {
    const hits = rankedSearch(DATA, "050-9990011");
    const hit = hits.find((h) => h.kind === "לקוח");
    expect(hit?.matchedField).toBe("טלפון");
    expect(hit?.title).toBe("אבי לוטם");
  });

  it("finds an email", () => {
    // S10.3: demo seed emails are all @example.com (non-routable) — search still
    // matches on the email field.
    const hits = rankedSearch(DATA, "info@example.com");
    expect(hits.some((h) => h.matchedField === "אימייל")).toBe(true);
  });

  it('finds a quotation by its Q-number (case-insensitive "Q-3")', () => {
    const hits = rankedSearch(DATA, "Q-3");
    const q = hits.find((h) => h.kind === "הצעת מחיר" && h.id === "q-3");
    expect(q).toBeDefined();
    expect(q?.matchedField).toBe("מספר הצעה");
    expect(q?.route).toBe("/sales");
  });

  it("finds a ticket by id", () => {
    const hits = rankedSearch(DATA, "t-9");
    const t = hits.find((h) => h.kind === "קריאת שירות" && h.id === "t-9");
    expect(t?.matchedField).toBe("מספר קריאה");
  });

  it("finds Hebrew names across collections", () => {
    const hits = rankedSearch(DATA, "דגש");
    expect(hits.some((h) => h.kind === "לקוח")).toBe(true);
    expect(hits.some((h) => h.kind === "ארגון")).toBe(true);
  });
});

describe("rankedSearch — deterministic ranking", () => {
  it("exact matches rank above startsWith above contains", () => {
    const hits = rankedSearch(DATA, "Bambu Lab A1");
    // "Bambu Lab A1" (exact) must come before "Bambu Lab A1 Mini" (startsWith)
    const exactIdx = hits.findIndex((h) => h.matchType === "exact");
    const startsIdx = hits.findIndex((h) => h.matchType === "startsWith");
    expect(exactIdx).toBeGreaterThanOrEqual(0);
    if (startsIdx >= 0) expect(exactIdx).toBeLessThan(startsIdx);
    const weights = hits.map((h) =>
      h.matchType === "exact" ? 3 : h.matchType === "startsWith" ? 2 : 1,
    );
    const sorted = [...weights].sort((a, b) => b - a);
    expect(weights).toEqual(sorted);
  });

  it("same query twice ⇒ identical ordered results", () => {
    expect(rankedSearch(DATA, "מדפסת")).toEqual(rankedSearch(DATA, "מדפסת"));
  });

  it("entity priority breaks match-type ties (customer before knowledge note)", () => {
    const hits = rankedSearch(DATA, "נועם קדם");
    const customerIdx = hits.findIndex((h) => h.kind === "לקוח");
    const knIdx = hits.findIndex((h) => h.kind === "רשומת ידע");
    expect(customerIdx).toBeGreaterThanOrEqual(0);
    if (knIdx >= 0 && hits[customerIdx]?.matchType === hits[knIdx]?.matchType) {
      expect(customerIdx).toBeLessThan(knIdx);
    }
  });

  it("empty query ⇒ no results; limit respected", () => {
    expect(rankedSearch(DATA, "   ")).toEqual([]);
    expect(rankedSearch(DATA, "א", 5).length).toBeLessThanOrEqual(5);
  });
});
