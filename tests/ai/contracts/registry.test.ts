// ProviderRegistry fallback matrix: remote healthy/unhealthy/disabled ×
// local permitted/not — including the mandatory Hebrew disclosure object.
import { describe, expect, it } from "vitest";
import type { AIProvider, AIProviderHealth } from "@/ai/contracts/AIProvider";
import { FALLBACK_MESSAGE_HE, ProviderRegistry } from "@/ai/providers/registry";
import { FIXED_NOW } from "./fixtures";

function stubProvider(id: string, health: AIProviderHealth | Error): AIProvider {
  return {
    id,
    displayName: id,
    health: () => (health instanceof Error ? Promise.reject(health) : Promise.resolve(health)),
    capabilities: () => Promise.reject(new Error("not used")),
    stream: () => {
      throw new Error("not used");
    },
    generateStructured: () => Promise.reject(new Error("not used")),
    summarize: () => Promise.reject(new Error("not used")),
    classify: () => Promise.reject(new Error("not used")),
    recommend: () => Promise.reject(new Error("not used")),
    explain: () => Promise.reject(new Error("not used")),
  };
}

const healthy: AIProviderHealth = { state: "מחובר", checkedAt: FIXED_NOW, detail: "אומת" };
const limited: AIProviderHealth = { state: "חיבור מוגבל", checkedAt: FIXED_NOW, detail: "מוגבל" };
const down: AIProviderHealth = { state: "לא זמין", checkedAt: FIXED_NOW, detail: "נפל" };
const authFail: AIProviderHealth = { state: "שגיאת אימות", checkedAt: FIXED_NOW, detail: "מפתח" };
const budget: AIProviderHealth = { state: "מגבלת תקציב", checkedAt: FIXED_NOW, detail: "תקציב" };
const local = stubProvider("local-rules", healthy);

function registry(
  remoteHealth: AIProviderHealth | Error,
  remoteEnabled: boolean,
  localFallbackPermitted: boolean,
): ProviderRegistry {
  return new ProviderRegistry(
    { remoteEnabled, localFallbackPermitted },
    { remote: stubProvider("remote", remoteHealth), local },
  );
}

describe("remote enabled", () => {
  it("remote verified (מחובר) ⇒ remote serves, NO fallback disclosure", async () => {
    const sel = await registry(healthy, true, true).select();
    expect(sel.provider?.id).toBe("remote");
    expect(sel.fallback).toBeNull();
    expect(sel.unavailable).toBeNull();
    expect(sel.remoteHealth?.state).toBe("מחובר");
  });

  it("remote limited (חיבור מוגבל) still serves — server verified it", async () => {
    const sel = await registry(limited, true, true).select();
    expect(sel.provider?.id).toBe("remote");
    expect(sel.fallback).toBeNull();
  });

  it("remote down + local permitted ⇒ local serves WITH the disclosed fallback", async () => {
    const sel = await registry(down, true, true).select();
    expect(sel.provider?.id).toBe("local-rules");
    expect(sel.fallback).toEqual({
      from: "remote",
      reason: "לא זמין",
      messageHe: FALLBACK_MESSAGE_HE,
    });
    expect(sel.unavailable).toBeNull();
  });

  it("remote down + local NOT permitted ⇒ structured unavailable, provider null", async () => {
    const sel = await registry(down, true, false).select();
    expect(sel.provider).toBeNull();
    expect(sel.fallback).toBeNull();
    expect(sel.unavailable?.code).toBe("AI_PROVIDER_UNAVAILABLE");
    expect(sel.unavailable?.messageHe.length).toBeGreaterThan(0);
  });

  it("auth failure maps to AI_PROVIDER_AUTH_FAILED when local not permitted", async () => {
    const sel = await registry(authFail, true, false).select();
    expect(sel.unavailable?.code).toBe("AI_PROVIDER_AUTH_FAILED");
  });

  it("budget-limit maps to AI_DAILY_BUDGET_EXCEEDED when local not permitted", async () => {
    const sel = await registry(budget, true, false).select();
    expect(sel.unavailable?.code).toBe("AI_DAILY_BUDGET_EXCEEDED");
  });

  it("health() throwing counts as unhealthy — disclosed fallback to local", async () => {
    const sel = await registry(new Error("boom"), true, true).select();
    expect(sel.provider?.id).toBe("local-rules");
    expect(sel.fallback?.messageHe).toBe(FALLBACK_MESSAGE_HE);
    expect(sel.remoteHealth?.state).toBe("לא זמין");
  });
});

describe("remote disabled (Mode A)", () => {
  it("local permitted ⇒ local is PRIMARY (no fallback disclosure — nothing fell back)", async () => {
    const sel = await registry(healthy, false, true).select();
    expect(sel.provider?.id).toBe("local-rules");
    expect(sel.fallback).toBeNull();
    expect(sel.unavailable).toBeNull();
    expect(sel.remoteHealth).toBeNull();
  });

  it("local not permitted ⇒ structured AI_PROVIDER_NOT_CONFIGURED", async () => {
    const sel = await registry(healthy, false, false).select();
    expect(sel.provider).toBeNull();
    expect(sel.unavailable?.code).toBe("AI_PROVIDER_NOT_CONFIGURED");
  });
});
