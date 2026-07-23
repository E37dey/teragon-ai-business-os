// W8-D — controlled settings: typed validation, ranges, immutable RTL,
// sensitive audit, canonical approval gating, real UI application.
import { beforeEach, describe, expect, it } from "vitest";
import type { AuditEvent } from "@/domain/types";
import { __resetRepositoriesForTests, getRepository } from "@/repositories";
import { agentStores } from "@/repositories/agentStores";
import { ApprovalEngine } from "@/agents/approvalEngine";
import {
  SETTING_DEFINITIONS,
  SETTING_GROUPS,
  SETTINGS_APPROVAL_RUN_ID,
  SettingChangeError,
  applyDecidedSettingApprovals,
  applyUiSettings,
  definitionsForGroup,
  effectiveValue,
  readSettingsRecord,
  setSetting,
  settingDefinition,
  type SettingsStores,
} from "@/modules/settings/settingsStore";

const T0 = "2026-07-23T09:00:00.000Z";

function stores(): SettingsStores {
  return {
    collection: (key) => getRepository(key),
    agentStores,
    now: () => T0,
  };
}

beforeEach(() => __resetRepositoriesForTests());

describe("registry shape — 7 groups, no secret-shaped setting anywhere", () => {
  it("covers exactly the 7 canonical groups and every group has settings", () => {
    expect([...SETTING_GROUPS]).toEqual([
      "business",
      "interface",
      "notifications",
      "ai",
      "memory-knowledge",
      "security",
      "demo",
    ]);
    for (const g of SETTING_GROUPS) {
      expect(definitionsForGroup(g).length).toBeGreaterThan(0);
    }
  });

  it("no setting key/label smells like an API key, token or password", () => {
    for (const def of SETTING_DEFINITIONS) {
      expect(def.key.toLowerCase()).not.toMatch(/api[-_]?key|token|secret|password/);
      expect(def.labelHe).not.toMatch(/מפתח API|סיסמה|טוקן/);
    }
  });

  it("every non-editable setting carries its Hebrew reason (no dead toggles)", () => {
    for (const def of SETTING_DEFINITIONS.filter((d) => !d.editable)) {
      expect(def.readOnlyReasonHe, def.key).toBeTruthy();
      expect((def.readOnlyReasonHe ?? "").length).toBeGreaterThan(10);
    }
  });
});

describe("validation + ranges", () => {
  it("defaults are returned before any change", async () => {
    const s = stores();
    const rec = await readSettingsRecord(s);
    expect(effectiveValue(rec, settingDefinition("interface.tablePageSize"))).toBe(10);
    expect(effectiveValue(rec, settingDefinition("interface.density"))).toBe("רגיל");
  });

  it("rejects out-of-range values with the allowed-range message", async () => {
    const s = stores();
    await expect(setSetting(s, "interface.tablePageSize", 999, "בודק")).rejects.toThrow(
      SettingChangeError,
    );
    await expect(setSetting(s, "interface.tablePageSize", 999, "בודק")).rejects.toThrow(/5 ל-50/);
    await expect(setSetting(s, "business.quotationValidityDays", 3, "בודק")).rejects.toThrow(
      SettingChangeError,
    );
  });

  it("rejects wrong types", async () => {
    const s = stores();
    await expect(setSetting(s, "interface.tablePageSize", "עשר", "בודק")).rejects.toThrow(
      SettingChangeError,
    );
  });

  it("an applied editable change persists with lastChanged metadata", async () => {
    const s = stores();
    const result = await setSetting(s, "interface.tablePageSize", 25, "צחי זוסטייהם");
    expect(result.status).toBe("applied");
    const rec = await readSettingsRecord(s);
    expect(effectiveValue(rec, settingDefinition("interface.tablePageSize"))).toBe(25);
    expect(rec.lastChanged["interface.tablePageSize"]?.by).toBe("צחי זוסטייהם");
  });
});

describe("RTL is immutable — non-disableable by construction", () => {
  it("the definition is read-only and any write attempt is refused with the reason", async () => {
    const def = settingDefinition("interface.rtl");
    expect(def.editable).toBe(false);
    const s = stores();
    await expect(setSetting(s, "interface.rtl", false, "בודק")).rejects.toThrow(/RTL אינו ניתן לכיבוי/);
    await expect(setSetting(s, "interface.rtl", true, "בודק")).rejects.toThrow(SettingChangeError);
    const rec = await readSettingsRecord(s);
    expect(effectiveValue(rec, def)).toBe(true);
  });
});

describe("approval-gated sensitive settings (canonical engine)", () => {
  it("a sensitive change does NOT apply — it creates a pending approval + audit", async () => {
    const s = stores();
    const result = await setSetting(s, "security.slaResponseTargetHours", 24, "צחי זוסטייהם");
    expect(result.status).toBe("pending-approval");
    expect(result.approvalId).toContain(SETTINGS_APPROVAL_RUN_ID);

    const rec = await readSettingsRecord(s);
    // still the default — nothing applied before a human decision
    expect(effectiveValue(rec, settingDefinition("security.slaResponseTargetHours"))).toBe(8);
    expect(rec.pending["security.slaResponseTargetHours"]?.requestedValue).toBe(24);

    const approvals = await agentStores().approvals.list();
    const approval = approvals.find((a) => a.id === result.approvalId);
    expect(approval?.status).toBe("ממתין");

    const audit = await getRepository<AuditEvent>("auditEvents").list();
    expect(audit.some((a) => a.action === "setting-change:security.slaResponseTargetHours")).toBe(true);
  });

  it("after approval in the canonical engine the value applies with audit", async () => {
    const s = stores();
    const result = await setSetting(s, "security.slaResponseTargetHours", 24, "צחי זוסטייהם");
    const engine = new ApprovalEngine({ stores: agentStores(), clock: () => T0 });
    await engine.decide({
      runId: SETTINGS_APPROVAL_RUN_ID,
      approvalId: result.approvalId ?? "",
      kind: "approve",
      decidedById: "u-1",
    });
    const sync = await applyDecidedSettingApprovals(s);
    expect(sync.applied).toEqual(["security.slaResponseTargetHours"]);
    const rec = await readSettingsRecord(s);
    expect(effectiveValue(rec, settingDefinition("security.slaResponseTargetHours"))).toBe(24);
    expect(rec.pending["security.slaResponseTargetHours"]).toBeUndefined();
  });

  it("a rejected change is dropped and never applied", async () => {
    const s = stores();
    const result = await setSetting(s, "security.destructiveConfirm", false, "צחי זוסטייהם");
    const engine = new ApprovalEngine({ stores: agentStores(), clock: () => T0 });
    await engine.decide({
      runId: SETTINGS_APPROVAL_RUN_ID,
      approvalId: result.approvalId ?? "",
      kind: "reject",
      decidedById: "u-1",
      noteHe: "ההגנה נשארת פעילה",
    });
    const sync = await applyDecidedSettingApprovals(s);
    expect(sync.rejected).toEqual(["security.destructiveConfirm"]);
    const rec = await readSettingsRecord(s);
    expect(effectiveValue(rec, settingDefinition("security.destructiveConfirm"))).toBe(true);
  });
});

describe("UI settings actually apply", () => {
  it("density צפוף scales the root font-size; רגיל restores it", async () => {
    const s = stores();
    await setSetting(s, "interface.density", "צפוף", "בודק");
    applyUiSettings(await readSettingsRecord(s), document);
    expect(document.documentElement.style.fontSize).toBe("93.75%");

    await setSetting(s, "interface.density", "רגיל", "בודק");
    applyUiSettings(await readSettingsRecord(s), document);
    expect(document.documentElement.style.fontSize).toBe("");
  });
});
