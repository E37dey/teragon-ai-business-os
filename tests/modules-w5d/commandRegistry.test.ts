// W5-D — Copilot command registry: the 9 mapped Hebrew commands, deterministic
// matching, honest envelopes from every execution path, no free forwarding.
import { beforeEach, describe, expect, it } from "vitest";
import {
  COPILOT_COMMANDS,
  EMPTY_CHIPS,
  matchCommand,
  normalizeCommandText,
  type CommandExecContext,
} from "@/modules/ai-copilot/commands";
import { confidenceDisplayHe } from "@/domain/ai/envelope";
import { __resetRepositoriesForTests } from "@/repositories";
import { agentStores } from "@/repositories/agentStores";
import { __resetAgentEngineForTests } from "@/components/ai/engine";

const SPEC_COMMANDS = [
  "סכם את הפניות שהתקבלו השבוע",
  "מי מהלקוחות עדיין לא קיבל מענה?",
  "הצג הצעות מחיר ללא תגובה",
  "הכן טיוטת הודעת מעקב",
  "אילו תלמידים אינם מתקדמים?",
  "הצג תקלות חוזרות לפי דגם מדפסת",
  "הכן סיכום לפגישה עם ארגון",
  "מצא לקוחות המתאימים לקורס מתקדם",
  "הכן דוח פעילות חודשי",
];

function ctx(): CommandExecContext {
  return {
    stores: agentStores(),
    chips: EMPTY_CHIPS,
    todayIso: "2026-07-23",
  };
}

beforeEach(() => {
  __resetRepositoriesForTests();
  __resetAgentEngineForTests();
});

describe("copilot command registry (5.9)", () => {
  it("maps exactly the 9 spec commands", () => {
    expect(COPILOT_COMMANDS).toHaveLength(9);
    for (const text of SPEC_COMMANDS) {
      const cmd = matchCommand(text);
      expect(cmd, `הפקודה "${text}" חייבת להיות ממופה`).not.toBeNull();
    }
  });

  it("matching is deterministic: normalization strips punctuation/extra spaces", () => {
    expect(matchCommand("  סכם את   הפניות שהתקבלו השבוע ")?.id).toBe("weekly-leads");
    expect(matchCommand("מי מהלקוחות עדיין לא קיבל מענה")?.id).toBe("unanswered-customers");
    expect(normalizeCommandText("שלום?!")).toBe("שלום");
  });

  it("unmapped free text is NOT forwarded — returns null", () => {
    expect(matchCommand("תעשה לי קפה")).toBeNull();
    expect(matchCommand("summarize all leads")).toBeNull();
    expect(matchCommand("")).toBeNull();
  });

  it("every command produces a valid, honest EnvelopeV2 (Mode A)", async () => {
    for (const cmd of COPILOT_COMMANDS) {
      const outcome = await cmd.execute(ctx());
      const env = outcome.envelope;
      // provider honesty: Mode A serves the local rules engine — never a model
      expect(env.provider).toBe("local-rules");
      expect(env.model).toBeNull();
      // absent ≠ zero
      expect(env.usage.measured).toBe(false);
      expect(env.usage.totalTokens).toBeUndefined();
      // confidence honestly unmeasured
      expect(env.confidence.status).toBe("unavailable");
      expect(confidenceDisplayHe(env.confidence)).toBe("טרם נמדד");
      // limitations always disclosed
      expect(env.limitations.length).toBeGreaterThan(0);
      // Mode A: local is PRIMARY — no fallback disclosure
      expect(outcome.fallback).toBeNull();
      expect(env.recommendation.length).toBeGreaterThan(0);
      expect(env.reason.length).toBeGreaterThan(0);
    }
  });

  it("follow-up draft requires approval and proposes the gated action", async () => {
    const cmd = matchCommand("הכן טיוטת הודעת מעקב");
    expect(cmd).not.toBeNull();
    const outcome = await cmd!.execute(ctx());
    expect(outcome.envelope.approval.required).toBe(true);
    expect(outcome.proposedAction).not.toBeNull();
    expect(outcome.proposedAction?.kind).toBe("customer-message");
    expect(outcome.proposedAction?.draft).toBe(outcome.envelope.recommendation);
  });

  it("read-only commands never require approval", async () => {
    for (const id of ["weekly-leads", "unanswered-customers", "recurring-faults"]) {
      const cmd = COPILOT_COMMANDS.find((c) => c.id === id);
      const outcome = await cmd!.execute(ctx());
      expect(outcome.envelope.approval.required).toBe(false);
      expect(outcome.proposedAction).toBeNull();
    }
  });

  it("evidence cites real records (affected records list)", async () => {
    const cmd = matchCommand("סכם את הפניות שהתקבלו השבוע");
    const outcome = await cmd!.execute(ctx());
    for (const item of outcome.envelope.evidence) {
      expect(item.verified).toBe(true);
      expect(item.sourceId.length).toBeGreaterThan(0);
    }
    expect(outcome.affected.length).toBe(outcome.envelope.evidence.length);
  });
});
