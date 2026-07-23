// W6-C — knowledge domain schemas: vocabulary sizes, valid/invalid parsing,
// Hebrew validation messages.
import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_STATES,
  knowledgeArticleV2Schema,
  knowledgeConflictSchema,
  knowledgeDraftInputSchema,
  knowledgeQuestionSchema,
  knowledgeReviewSchema,
  knowledgeSourceSchema,
  knowledgeUsageSchema,
  knowledgeVersionSchema,
} from "@/domain/knowledge";
import { makeArticle, makeDraftInput } from "./helpers";

describe("knowledge vocabularies", () => {
  it("has exactly the 9 canonical categories", () => {
    expect(KNOWLEDGE_CATEGORIES).toHaveLength(9);
    expect(KNOWLEDGE_CATEGORIES).toContain("פתרון תקלות");
    expect(KNOWLEDGE_CATEGORIES).toContain("Slicer");
    expect(KNOWLEDGE_CATEGORIES).toContain("נהלים");
  });

  it("has exactly the 7 canonical states", () => {
    expect(KNOWLEDGE_STATES).toHaveLength(7);
    expect(KNOWLEDGE_STATES).toEqual([
      "טיוטה",
      "ממתין לבדיקה",
      "מאושר",
      "דורש עדכון",
      "שנוי במחלוקת",
      "נדחה",
      "בארכיון",
    ]);
  });
});

describe("knowledgeArticleV2Schema", () => {
  it("accepts a fully-formed article", () => {
    expect(knowledgeArticleV2Schema.safeParse(makeArticle()).success).toBe(true);
  });

  it("rejects an unknown category", () => {
    const bad = { ...makeArticle(), category: "קטגוריה מומצאת" };
    expect(knowledgeArticleV2Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown state", () => {
    const article = makeArticle();
    const bad = { ...article, approval: { ...article.approval, state: "מאושר-בערך" } };
    expect(knowledgeArticleV2Schema.safeParse(bad).success).toBe(false);
  });

  it("rejects version 0 (versions start at 1)", () => {
    expect(knowledgeArticleV2Schema.safeParse({ ...makeArticle(), version: 0 }).success).toBe(false);
  });
});

describe("knowledgeDraftInputSchema (form validation)", () => {
  it("accepts a valid draft input", () => {
    expect(knowledgeDraftInputSchema.safeParse(makeDraftInput()).success).toBe(true);
  });

  it("rejects a too-short title with a Hebrew message", () => {
    const res = knowledgeDraftInputSchema.safeParse(makeDraftInput({ title: "אב" }));
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("כותרת המאמר קצרה מדי (לפחות 3 תווים)");
    }
  });

  it("rejects empty content with a Hebrew message", () => {
    const res = knowledgeDraftInputSchema.safeParse(makeDraftInput({ content: "" }));
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("תוכן המאמר הוא שדה חובה");
    }
  });
});

describe("companion record schemas", () => {
  const base = { id: "x-1", createdAt: "2026-07-01", updatedAt: "2026-07-01" };

  it("knowledgeSource requires a kind from the closed list", () => {
    const good = {
      ...base,
      articleId: "ka-1",
      kind: "קריאת שירות",
      ref: "ticket:t-9",
      titleHe: "מקור",
      capturedAt: "2026-07-01",
      ownerId: null,
    };
    expect(knowledgeSourceSchema.safeParse(good).success).toBe(true);
    expect(knowledgeSourceSchema.safeParse({ ...good, kind: "שמועה" }).success).toBe(false);
  });

  it("knowledgeVersion snapshot is structurally validated", () => {
    const good = {
      ...base,
      articleId: "ka-1",
      version: 1,
      snapshot: {
        title: "כותרת",
        category: "שירות",
        summary: "",
        content: "",
        supportedPrinterModels: [],
        supportedMaterials: [],
        troubleshootingCategories: [],
        safetyNotes: [],
      },
      changeNoteHe: "",
      createdById: "u-tzachi",
    };
    expect(knowledgeVersionSchema.safeParse(good).success).toBe(true);
    expect(knowledgeVersionSchema.safeParse({ ...good, snapshot: {} }).success).toBe(false);
  });

  it("knowledgeUsage / conflict / question / review parse valid records", () => {
    expect(
      knowledgeUsageSchema.safeParse({
        ...base,
        articleId: "ka-1",
        articleVersion: 1,
        usedAt: "2026-07-01",
        byAgent: "ag-wiki",
        inRecommendation: "rec-1",
        supersededByVersion: null,
        supersededAt: null,
      }).success,
    ).toBe(true);
    expect(
      knowledgeConflictSchema.safeParse({
        ...base,
        articleIds: ["ka-1", "ka-2"],
        claims: [{ articleId: "ka-1", articleVersion: 1, claimHe: "טענה" }],
        overlapKeyHe: "טמפ' מיטה",
        detectionMethodHe: "חפיפה",
        status: "פתוח",
        detectedAt: "2026-07-01",
        resolvedAt: null,
        resolutionNoteHe: "",
      }).success,
    ).toBe(true);
    expect(
      knowledgeQuestionSchema.safeParse({
        ...base,
        questionHe: "מה טמפ' המיטה?",
        askedById: "u-tzachi",
        askedAt: "2026-07-01",
        status: "פתוחה",
        answeredByArticleId: null,
        answerHe: null,
      }).success,
    ).toBe(true);
    expect(
      knowledgeReviewSchema.safeParse({
        ...base,
        articleId: "ka-1",
        articleVersion: 1,
        reviewerId: null,
        requestedById: "u-tzachi",
        requestedAt: "2026-07-01",
        decidedAt: null,
        decision: null,
        noteHe: "",
        approvalId: "ap-1",
      }).success,
    ).toBe(true);
  });

  it("knowledgeConflict requires at least two articles", () => {
    expect(
      knowledgeConflictSchema.safeParse({
        ...base,
        articleIds: ["ka-1"],
        claims: [],
        overlapKeyHe: "x",
        detectionMethodHe: "y",
        status: "פתוח",
        detectedAt: "2026-07-01",
        resolvedAt: null,
        resolutionNoteHe: "",
      }).success,
    ).toBe(false);
  });
});
