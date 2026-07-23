// Shared fixtures for the W6-C knowledge-governance tests: deterministic
// clock, fresh factory-backed stores (InMemory in jsdom), a real canonical
// ApprovalEngine and governance service.
import { ApprovalEngine } from "@/agents/approvalEngine";
import type { KnowledgeArticleV2, KnowledgeDraftInput } from "@/domain/knowledge";
import { KnowledgeGovernanceService } from "@/knowledge/governance";
import { knowledgeStores, type KnowledgeStores } from "@/knowledge/stores";
import { __resetRepositoriesForTests } from "@/repositories";
import { agentStores } from "@/repositories/agentStores";

export const NOW = "2026-07-23T12:00:00.000Z";
export const TODAY = NOW.slice(0, 10);

/** Deterministic clock: each call advances by stepMs (default 10ms). */
export function makeClock(startISO = NOW, stepMs = 10): () => string {
  let t = Date.parse(startISO);
  return () => {
    const iso = new Date(t).toISOString();
    t += stepMs;
    return iso;
  };
}

export interface Fixture {
  stores: KnowledgeStores;
  engine: ApprovalEngine;
  gov: KnowledgeGovernanceService;
  clock: () => string;
}

/** Fresh everything per test — factory reset ⇒ empty knowledge collections. */
export function fresh(): Fixture {
  __resetRepositoriesForTests();
  const clock = makeClock();
  const stores = knowledgeStores();
  const engine = new ApprovalEngine({ stores: agentStores(), clock });
  const gov = new KnowledgeGovernanceService({ stores, engine, clock });
  return { stores, engine, gov, clock };
}

let seq = 0;

/** A fully-formed article — default: approved + effective + not expired. */
export function makeArticle(overrides: Partial<KnowledgeArticleV2> = {}): KnowledgeArticleV2 {
  seq += 1;
  return {
    id: `ka-t-${seq}`,
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-01T08:00:00.000Z",
    title: `מאמר בדיקה ${seq} — וורפינג PETG`,
    category: "פתרון תקלות",
    summary: "תקציר בדיקה",
    content: "וורפינג ב-PETG: Brim 5 מ\"מ וטמפ' מיטה 70°C פותרים כמעט תמיד.",
    supportedPrinterModels: ["pm-2"],
    supportedMaterials: ["PETG"],
    troubleshootingCategories: ["וורפינג"],
    safetyNotes: [],
    sourceIds: [],
    authorId: "u-tzachi",
    reviewerId: "u-tzachi",
    approval: {
      state: "מאושר",
      approvalId: null,
      decidedById: "u-tzachi",
      decidedAt: "2026-07-01T08:00:00.000Z",
      noteHe: "",
    },
    version: 1,
    effectiveDate: "2026-07-01",
    reviewDate: "2026-12-31",
    archived: false,
    demo: false,
    ...overrides,
  };
}

export function makeDraftInput(overrides: Partial<KnowledgeDraftInput> = {}): KnowledgeDraftInput {
  return {
    title: "נוהל ניקוי חוד הדפסה",
    category: "תחזוקה",
    summary: "ניקוי תקופתי של החוד",
    content: "לנקות את החוד כל 100 שעות הדפסה במברשת פליז.",
    supportedPrinterModels: ["pm-3"],
    supportedMaterials: ["PLA"],
    troubleshootingCategories: ["סתימה"],
    safetyNotes: ["החוד חם — להמתין לקירור"],
    ...overrides,
  };
}
