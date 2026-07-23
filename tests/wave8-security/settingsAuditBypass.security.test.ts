// W8-F (8.15) GAP-FILL — settings-audit bypass attempts.
//
// GAP ANALYSIS (existing, NOT re-tested): tests/settings/settingsStore.test.ts
// pins the HAPPY approval flow (sensitive ⇒ pending + audit; approved ⇒ apply
// + audit; rejected ⇒ dropped + audit) and RTL immutability.
// NOT covered anywhere before this file — the BYPASS attempts:
//   (a) deleting the pending change's approval record does NOT apply the
//       change (fail-closed: no approval ⇒ still pending, value untouched);
//   (b) tampering the persisted meta record with a SCHEMA-INVALID value never
//       becomes effective — effectiveValue re-validates and falls back to the
//       default (read-side guard);
//   (c) HONEST LIMITATION pinned: tampering the meta record directly with a
//       schema-VALID value DOES take effect without an audit event — the
//       repository layer has no write-guard (no auth model, single-CEO demo).
//       Documented in docs/WAVE_8_SECURITY_REPORT.md, not silently claimed.
//   (d) forging an approval status by writing a bogus decided approval id
//       into pending: applyDecidedSettingApprovals only applies what the
//       CANONICAL approvals collection says — an id that resolves to nothing
//       keeps the change pending forever.
import { beforeEach, describe, expect, it } from "vitest";
import type { AuditEvent } from "@/domain/types";
import { __resetRepositoriesForTests, getRepository } from "@/repositories";
import { agentStores } from "@/repositories/agentStores";
import {
  SETTINGS_META_ID,
  applyDecidedSettingApprovals,
  effectiveValue,
  readSettingsRecord,
  setSetting,
  settingDefinition,
  type SettingsRecord,
  type SettingsStores,
} from "@/modules/settings/settingsStore";

const T0 = "2026-07-23T12:00:00.000Z";

function stores(): SettingsStores {
  return {
    collection: (key) => getRepository(key),
    agentStores,
    now: () => T0,
  };
}

beforeEach(() => __resetRepositoriesForTests());

const SENSITIVE_KEY = "security.slaResponseTargetHours";

describe("W8-F 8.15 — approval bypass attempts fail closed", () => {
  it("(a) deleting the approval record never applies the pending change", async () => {
    const s = stores();
    const result = await setSetting(s, SENSITIVE_KEY, 24, "צחי זוסטייהם");
    expect(result.status).toBe("pending-approval");

    // ATTACK: remove the pending approval from the canonical engine store
    await agentStores().approvals.remove(result.approvalId!);

    const sync = await applyDecidedSettingApprovals(s);
    expect(sync.applied).toEqual([]);
    expect(sync.stillPending).toContain(SENSITIVE_KEY);
    const rec = await readSettingsRecord(s);
    expect(effectiveValue(rec, settingDefinition(SENSITIVE_KEY))).toBe(8); // default
  });

  it("(d) a forged approvalId that resolves to nothing keeps the change pending", async () => {
    const s = stores();
    await setSetting(s, SENSITIVE_KEY, 24, "צחי זוסטייהם");
    const repo = s.collection<SettingsRecord>("meta");
    const rec = await readSettingsRecord(s);
    // ATTACK: rewrite the pending entry to point at a fabricated approval id
    await repo.update(SETTINGS_META_ID, {
      pending: {
        ...rec.pending,
        [SENSITIVE_KEY]: {
          ...rec.pending[SENSITIVE_KEY]!,
          approvalId: "ap-forged-does-not-exist",
        },
      },
    });
    const sync = await applyDecidedSettingApprovals(s);
    expect(sync.applied).toEqual([]);
    expect(sync.stillPending).toContain(SENSITIVE_KEY);
    const after = await readSettingsRecord(s);
    expect(effectiveValue(after, settingDefinition(SENSITIVE_KEY))).toBe(8);
  });
});

describe("W8-F 8.15 — direct meta tampering", () => {
  it("(b) a schema-INVALID tampered value never becomes effective (read-side guard)", async () => {
    const s = stores();
    const repo = s.collection<SettingsRecord>("meta");
    const rec = await readSettingsRecord(s);
    // ATTACK: write an out-of-range value straight into the persisted record
    await repo.update(SETTINGS_META_ID, {
      values: { ...rec.values, [SENSITIVE_KEY]: 9999 },
    });
    const after = await readSettingsRecord(s);
    // effectiveValue re-validates against the definition schema ⇒ default wins
    expect(effectiveValue(after, settingDefinition(SENSITIVE_KEY))).toBe(8);
  });

  it("(c) HONEST LIMITATION: a schema-VALID direct tamper applies WITHOUT audit (pinned)", async () => {
    const s = stores();
    const repo = s.collection<SettingsRecord>("meta");
    const rec = await readSettingsRecord(s);
    await repo.update(SETTINGS_META_ID, {
      values: { ...rec.values, [SENSITIVE_KEY]: 24 },
    });
    const after = await readSettingsRecord(s);
    expect(effectiveValue(after, settingDefinition(SENSITIVE_KEY))).toBe(24);
    const audit = await getRepository<AuditEvent>("auditEvents").list();
    // NO setting-change audit exists for this tamper — the gap is real and
    // documented (no repository write-guard in the no-auth demo model). If a
    // write-guard lands, this pin flips and the report upgrades the item.
    expect(audit.some((a) => a.action === `setting-change:${SENSITIVE_KEY}`)).toBe(false);
  });
});
