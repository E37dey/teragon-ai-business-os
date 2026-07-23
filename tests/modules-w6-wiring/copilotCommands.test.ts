// W6 WIRING — the 8 cross-domain Copilot commands (Phase 6.19):
// each maps to a defined op (no free forwarding), every answer is an honest
// local-rules envelope, the Wiki no-source passthrough is exact, the
// conversation-proposal path only creates a PENDING proposal, and
// rejected/draft knowledge NEVER surfaces in answers.
import { beforeEach, describe, expect, it } from "vitest";
import {
  ALL_COPILOT_COMMANDS,
  COPILOT_COMMANDS,
  EMPTY_CHIPS,
  matchCommand,
  W6_MEMORY_COMMANDS,
  type CommandExecContext,
} from "@/modules/ai-copilot/commands";
import { AIError } from "@/ai/contracts/AIProvider";
import { NO_APPROVED_SOURCE_HE } from "@/agents/wiki";
import { knowledgeStores } from "@/knowledge/stores";
import { getMemoryEngine } from "@/memory/core/engine";
import { getRepository } from "@/repositories";
import { agentStores } from "@/repositories/agentStores";
import type { LearningProposal } from "@/domain/learning";
import { makeArticle } from "../knowledge/helpers";
import { makeProposal } from "../learning/helpers";
import { freshAll, firstCustomer, seedRejectedRecommendation } from "./helpers";

const SPEC_W6_COMMANDS: Record<string, string> = {
  "מה אנחנו יודעים על הלקוח הזה?": "copilot.customer-memory",
  "אילו מקורות תומכים בהמלצה?": "copilot.recommendation-evidence",
  "מצא ידע מאושר על Warping": "wiki.search-approved",
  "הצג סתירות במאגר הידע": "wiki.show-contradictions",
  "הצע פריט זיכרון מהשיחה": "memory.propose-from-conversation",
  "הצג הצעות זיכרון שממתינות לאישור": "copilot.memory-pending-proposals",
  "אילו המלצות נדחו לאחרונה ולמה?": "copilot.learning-rejected-recommendations",
  "אילו תובנות ממתינות לבדיקת מנהל?": "copilot.learning-pending-proposals",
};

function ctx(overrides: Partial<CommandExecContext> = {}): CommandExecContext {
  return {
    stores: agentStores(),
    chips: EMPTY_CHIPS,
    todayIso: "2026-07-23",
    ...overrides,
  };
}

beforeEach(freshAll);

describe("registry mapping (6.19)", () => {
  it("adds exactly the 8 mandated commands, each bound to a defined op", () => {
    expect(W6_MEMORY_COMMANDS).toHaveLength(8);
    expect(ALL_COPILOT_COMMANDS).toHaveLength(COPILOT_COMMANDS.length + 8);
    for (const [text, operation] of Object.entries(SPEC_W6_COMMANDS)) {
      const cmd = matchCommand(text);
      expect(cmd, `הפקודה "${text}" חייבת להיות ממופה`).not.toBeNull();
      expect(cmd?.operation).toBe(operation);
      expect(cmd?.binding).toBe("local");
    }
  });

  it("knowledge search is generic — any topic suffix maps, free text still does not", () => {
    expect(matchCommand("מצא ידע מאושר על PLA")?.id).toBe("knowledge-search");
    expect(matchCommand("מצא ידע מאושר על נושא שלא קיים בכלל")?.id).toBe("knowledge-search");
    expect(matchCommand("תעשה לי קפה")).toBeNull();
    expect(matchCommand("find approved knowledge")).toBeNull();
  });

  it("every W6 command returns an honest local-rules envelope", async () => {
    const customer = await firstCustomer();
    for (const cmd of W6_MEMORY_COMMANDS) {
      const outcome = await cmd.execute(
        ctx({
          chips: { ...EMPTY_CHIPS, customerId: customer.id },
          inputText: cmd.textHe,
          conversationSummaryHe: "סיכום שיחה לבדיקה — תובנת בדיקה על תהליך המכירה",
        }),
      );
      const env = outcome.envelope;
      expect(env.provider).toBe("local-rules"); // provider disclosure
      expect(env.model).toBeNull();
      expect(env.usage.measured).toBe(false);
      expect(env.confidence.status).toBe("unavailable");
      expect(env.limitations.length).toBeGreaterThan(0);
      expect(env.recommendation.length).toBeGreaterThan(0);
      expect(outcome.fallback).toBeNull();
      // evidence always cites real, verified records
      for (const item of env.evidence) {
        expect(item.verified).toBe(true);
        expect(item.sourceId.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("customer memory command — context chip + sensitivity gate", () => {
  it("without a customer chip the command refuses (no guessing)", async () => {
    const cmd = matchCommand("מה אנחנו יודעים על הלקוח הזה?");
    await expect(cmd!.execute(ctx())).rejects.toSatisfy(
      (err: unknown) => err instanceof AIError && err.code === "AI_EVIDENCE_REQUIRED",
    );
  });

  it("with a chip: real evidence, navigable routes, sensitive bodies never in the answer", async () => {
    const customer = await firstCustomer();
    const { makeV2Record } = await import("./helpers");
    await getRepository("memoryRecords").create(
      makeV2Record({
        entityLinks: [{ collection: "customers", entityId: customer.id, label: customer.name }],
        sensitivity: "מוגבל",
        title: "פריט מוגבל לבדיקה",
        bodyMarkdown: "סוד-עסקי-אסור-לחשיפה",
      }),
    );
    const cmd = matchCommand("מה אנחנו יודעים על הלקוח הזה?");
    const outcome = await cmd!.execute(ctx({ chips: { ...EMPTY_CHIPS, customerId: customer.id } }));
    expect(outcome.envelope.recommendation).not.toContain("סוד-עסקי-אסור-לחשיפה");
    expect(outcome.envelope.recommendation).toContain("מוסתרים");
    for (const a of outcome.affected) {
      expect(a.route).toMatch(/^\/memory/);
    }
  });
});

describe("knowledge commands — approved-only, exact no-source passthrough", () => {
  it("no approved source ⇒ EXACTLY the Wiki passthrough string", async () => {
    const cmd = matchCommand("מצא ידע מאושר על נושאשלאקייםבכלל");
    const outcome = await cmd!.execute(ctx({ inputText: "מצא ידע מאושר על נושאשלאקייםבכלל" }));
    expect(outcome.envelope.recommendation).toBe(NO_APPROVED_SOURCE_HE);
    expect(outcome.envelope.evidence).toEqual([]);
  });

  it("rejected/draft/pending knowledge NEVER surfaces — only approved articles", async () => {
    const stores = knowledgeStores();
    await stores.articles.create(
      makeArticle({ id: "ka-w6-approved", title: "וורפינג PETG — פתרון מאושר" }),
    );
    await stores.articles.create(
      makeArticle({
        id: "ka-w6-draft",
        title: "וורפינג טיוטה חשאית",
        content: "וורפינג — טיוטה שאסור שתופיע",
        approval: {
          state: "טיוטה",
          approvalId: null,
          decidedById: null,
          decidedAt: null,
          noteHe: "",
        },
      }),
    );
    await stores.articles.create(
      makeArticle({
        id: "ka-w6-rejected",
        title: "וורפינג שנדחה",
        content: "וורפינג — תוכן שנדחה",
        approval: {
          state: "נדחה",
          approvalId: null,
          decidedById: "u-tzachi",
          decidedAt: "2026-07-02T08:00:00.000Z",
          noteHe: "נדחה",
        },
      }),
    );
    const cmd = matchCommand("מצא ידע מאושר על וורפינג");
    const outcome = await cmd!.execute(ctx({ inputText: "מצא ידע מאושר על וורפינג" }));
    const ids = outcome.envelope.evidence.map((e) => e.sourceId);
    expect(ids).toContain("ka-w6-approved");
    expect(ids).not.toContain("ka-w6-draft");
    expect(ids).not.toContain("ka-w6-rejected");
    expect(outcome.envelope.recommendation).not.toContain("טיוטה חשאית");
    expect(outcome.envelope.recommendation).not.toContain("שנדחה");
  });

  it("contradictions command returns an honest zero on a clean store", async () => {
    const cmd = matchCommand("הצג סתירות במאגר הידע");
    const outcome = await cmd!.execute(ctx());
    expect(outcome.envelope.operation).toBe("wiki.show-contradictions");
    expect(outcome.envelope.recommendation).toContain("לא נמצאו סתירות");
  });
});

describe("conversation → memory proposal (governed, never direct)", () => {
  it("creates a PENDING proposal via the workflow; no approved record is written", async () => {
    const before = (await getMemoryEngine().stores.records.list()).length;
    const cmd = matchCommand("הצע פריט זיכרון מהשיחה");
    const outcome = await cmd!.execute(
      ctx({ conversationSummaryHe: "הלקוח ביקש הצעה ל-3 מדפסות עם הדרכה" }),
    );
    expect(outcome.envelope.approval.required).toBe(true);
    expect(outcome.envelope.approval.state).toBe("pending");
    const proposals = await getMemoryEngine().stores.proposals.list();
    const mine = proposals.find((p) => p.observationHe.includes("הלקוח ביקש הצעה ל-3 מדפסות"));
    expect(mine).toBeTruthy();
    expect(mine?.status).toBe("ממתין לאישור");
    expect(mine?.resultRecordId).toBeNull();
    const after = (await getMemoryEngine().stores.records.list()).length;
    expect(after).toBe(before); // nothing approved directly
  });

  it("an empty conversation is refused honestly", async () => {
    const cmd = matchCommand("הצע פריט זיכרון מהשיחה");
    await expect(cmd!.execute(ctx({ conversationSummaryHe: "  " }))).rejects.toSatisfy(
      (err: unknown) => err instanceof AIError && err.code === "AI_EVIDENCE_REQUIRED",
    );
  });

  it("the pending-proposals command then lists it with a /memory route", async () => {
    const propose = matchCommand("הצע פריט זיכרון מהשיחה");
    await propose!.execute(ctx({ conversationSummaryHe: "תצפית בדיקה לרשימת ממתינים" }));
    const cmd = matchCommand("הצג הצעות זיכרון שממתינות לאישור");
    const outcome = await cmd!.execute(ctx());
    expect(outcome.envelope.recommendation).toContain("תובנה משיחת Copilot");
    expect(outcome.affected.length).toBeGreaterThan(0);
    expect(outcome.affected[0]?.route).toMatch(/^\/memory/);
  });
});

describe("learning commands — derived from records", () => {
  it("rejected recommendations surface with the approval-note reason", async () => {
    const { rec, approval } = await seedRejectedRecommendation();
    const cmd = matchCommand("אילו המלצות נדחו לאחרונה ולמה?");
    const outcome = await cmd!.execute(ctx());
    expect(outcome.envelope.recommendation).toContain(rec.title);
    expect(outcome.envelope.recommendation).toContain(approval.note);
    expect(outcome.affected.some((a) => a.id === rec.id)).toBe(true);
  });

  it("pending learning proposals only — decided proposals never appear", async () => {
    const repo = getRepository<LearningProposal>("learningProposals");
    await repo.create(makeProposal({ id: "lp-w6-pending", approvalState: "pending" }));
    await repo.create(
      makeProposal({
        id: "lp-w6-rejected",
        approvalState: "rejected",
        proposedInsightHe: "תובנה שנדחתה ואסור שתופיע",
      }),
    );
    const cmd = matchCommand("אילו תובנות ממתינות לבדיקת מנהל?");
    const outcome = await cmd!.execute(ctx());
    expect(outcome.envelope.recommendation).toContain("תובנת בדיקה נגזרת");
    expect(outcome.envelope.recommendation).toContain("צחי זוסטייהם");
    expect(outcome.envelope.recommendation).not.toContain("תובנה שנדחתה ואסור שתופיע");
    expect(outcome.affected.map((a) => a.id)).toEqual(["lp-w6-pending"]);
    expect(outcome.affected[0]?.route).toMatch(/^\/learning/);
  });
});
