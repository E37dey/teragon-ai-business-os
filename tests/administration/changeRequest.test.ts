// W8-C — the guarded permission-change lifecycle through the CANONICAL
// ApprovalEngine: preview → approval (named approver, not self, never AI) →
// execute → verify (read-back) → audit. Reject path mutates nothing.
import { beforeEach, describe, expect, it } from "vitest";
import { listCanonicalRoles } from "@/repositories/roleStores";
import { freshFixture, type Fixture } from "./helpers";
import type { RequestPermissionChangeInput } from "@/administration";

let fx: Fixture;

function baseInput(over: Partial<RequestPermissionChangeInput> = {}): RequestPermissionChangeInput {
  return {
    kind: "user-override",
    targetId: "u-maya",
    domain: "service",
    newLevel: "write",
    requestedById: "u-tzachi",
    requestedByName: "צחי זוסטייהם",
    approverId: "u-noa",
    approverName: "נעה פרידמן",
    ...over,
  };
}

beforeEach(async () => {
  fx = freshFixture();
  await fx.service.ensureBaseline();
});

describe("request creation (preview + canonical engine)", () => {
  it("creates a pending record with preview + a real Approval in the engine", async () => {
    const rec = await fx.service.requestPermissionChange(baseInput());
    expect(rec.status).toBe("ממתין");
    expect(rec.previewHe).toContain("מאיה ברק");
    expect(rec.previewHe).toContain("שירות ותיקונים");
    expect(rec.approvalId).not.toBeNull();
    const approval = await fx.agents.approvals.get(rec.approvalId ?? "");
    expect(approval?.status).toBe("ממתין");
    expect(approval?.note).toContain("שינוי הרשאות");
    const audit = await fx.service.listAdminAudit();
    expect(audit.some((a) => a.action === "admin.permission.request")).toBe(true);
  });

  it("blocks a self-approving request at creation time", async () => {
    await expect(
      fx.service.requestPermissionChange(baseInput({ approverId: "u-tzachi", approverName: "צחי" })),
    ).rejects.toMatchObject({ code: "ADMIN_SELF_APPROVAL_FORBIDDEN" });
  });

  it("blocks an AI agent as approver at creation time", async () => {
    await expect(
      fx.service.requestPermissionChange(baseInput({ approverId: "ag-hunter", approverName: "Hunter" })),
    ).rejects.toMatchObject({ code: "ADMIN_AI_ACTOR_FORBIDDEN" });
  });

  it("blocks an AI agent as requester", async () => {
    await expect(
      fx.service.requestPermissionChange(baseInput({ requestedById: "ag-flow" })),
    ).rejects.toMatchObject({ code: "ADMIN_AI_ACTOR_FORBIDDEN" });
  });

  it("blocks an inactive approver (named approver must be an active user)", async () => {
    await fx.service.suspendUser("u-noa", "u-tzachi", "בדיקה");
    await expect(fx.service.requestPermissionChange(baseInput())).rejects.toMatchObject({
      code: "ADMIN_APPROVER_INVALID",
    });
  });
});

describe("invalid combinations cannot even be requested", () => {
  it("מכירות + זיכרון טכני מוגבל (any level) is blocked", async () => {
    await expect(
      fx.service.requestPermissionChange(
        baseInput({ targetId: "u-maya", domain: "memory-restricted", newLevel: "read" }),
      ),
    ).rejects.toMatchObject({ code: "ADMIN_INVALID_COMBINATION" });
  });

  it("role-grant: צופה + כתיבה is blocked", async () => {
    await expect(
      fx.service.requestPermissionChange(
        baseInput({ kind: "role-grant", targetId: "crole-viewer", domain: "crm", newLevel: "write" }),
      ),
    ).rejects.toMatchObject({ code: "ADMIN_INVALID_COMBINATION" });
  });

  it("role-grant: שירות + אישור כספים is blocked", async () => {
    await expect(
      fx.service.requestPermissionChange(
        baseInput({ kind: "role-grant", targetId: "crole-service", domain: "finance", newLevel: "approve" }),
      ),
    ).rejects.toMatchObject({ code: "ADMIN_INVALID_COMBINATION" });
  });

  it("role-grant: Champion + עריכת ממשל is blocked", async () => {
    await expect(
      fx.service.requestPermissionChange(
        baseInput({ kind: "role-grant", targetId: "crole-champion", domain: "governance", newLevel: "write" }),
      ),
    ).rejects.toMatchObject({ code: "ADMIN_INVALID_COMBINATION" });
  });
});

describe("approve → execute → verify → audit", () => {
  it("user-override lifecycle ends verified with the new effective grant", async () => {
    const rec = await fx.service.requestPermissionChange(baseInput());
    const done = await fx.service.approveChangeRequest(rec.id, "u-noa", "מאושר");
    expect(done.status).toBe("בוצע");
    expect(done.verifiedAt).not.toBeNull();
    expect(done.decidedById).toBe("u-noa");
    const eff = await fx.service.effectiveGrants("u-maya");
    expect(eff.grants.service).toBe("write");
    expect(eff.overrides).toEqual([{ domain: "service", level: "write" }]);
    // canonical engine state: approval decided + executed
    const approval = await fx.agents.approvals.get(rec.approvalId ?? "");
    expect(approval?.status).toBe("אושר");
    const state = await fx.service.engine.workflowState(rec.runId, rec.approvalId ?? "");
    expect(state).toBe("executed");
    const audit = await fx.service.listAdminAudit();
    expect(audit.some((a) => a.action === "admin.permission.execute")).toBe(true);
  });

  it("role-grant lifecycle updates the canonical role record (verified)", async () => {
    const rec = await fx.service.requestPermissionChange(
      baseInput({ kind: "role-grant", targetId: "crole-instructor", domain: "analytics", newLevel: "write" }),
    );
    const done = await fx.service.approveChangeRequest(rec.id, "u-noa");
    expect(done.status).toBe("בוצע");
    const roles = await listCanonicalRoles(fx.roles);
    expect(roles.find((r) => r.roleId === "crole-instructor")?.grants.analytics).toBe("write");
  });

  it("self-approval is blocked at decision time (requester can never decide)", async () => {
    const rec = await fx.service.requestPermissionChange(baseInput());
    await expect(fx.service.approveChangeRequest(rec.id, "u-tzachi")).rejects.toMatchObject({
      code: "ADMIN_SELF_APPROVAL_FORBIDDEN",
    });
  });

  it("an AI agent can never decide", async () => {
    const rec = await fx.service.requestPermissionChange(baseInput());
    await expect(fx.service.approveChangeRequest(rec.id, "ag-fixer")).rejects.toMatchObject({
      code: "ADMIN_AI_ACTOR_FORBIDDEN",
    });
  });

  it("only the NAMED approver may decide", async () => {
    const rec = await fx.service.requestPermissionChange(baseInput());
    await expect(fx.service.approveChangeRequest(rec.id, "u-oren")).rejects.toMatchObject({
      code: "ADMIN_APPROVER_INVALID",
    });
  });

  it("a decided request cannot be decided again", async () => {
    const rec = await fx.service.requestPermissionChange(baseInput());
    await fx.service.approveChangeRequest(rec.id, "u-noa");
    await expect(fx.service.approveChangeRequest(rec.id, "u-noa")).rejects.toMatchObject({
      code: "ADMIN_STATE_INVALID",
    });
  });
});

describe("reject path — no mutation", () => {
  it("rejection leaves grants, assignments and roles untouched", async () => {
    const before = await fx.service.effectiveGrants("u-maya");
    const rec = await fx.service.requestPermissionChange(baseInput());
    const rejected = await fx.service.rejectChangeRequest(rec.id, "u-noa", "אין צורך עסקי");
    expect(rejected.status).toBe("נדחה");
    expect(rejected.noteHe).toBe("אין צורך עסקי");
    const after = await fx.service.effectiveGrants("u-maya");
    expect(after.grants).toEqual(before.grants);
    expect(after.overrides).toEqual([]);
    const approval = await fx.agents.approvals.get(rec.approvalId ?? "");
    expect(approval?.status).toBe("נדחה");
    const audit = await fx.service.listAdminAudit();
    expect(audit.some((a) => a.action === "admin.permission.reject")).toBe(true);
    expect(audit.some((a) => a.action === "admin.permission.execute")).toBe(false);
  });
});

describe("emergency locks over the workflow", () => {
  it("permission-change-lock blocks new requests AND decisions", async () => {
    const rec = await fx.service.requestPermissionChange(baseInput());
    fx.flags.set("permission-change-lock", true);
    await expect(fx.service.requestPermissionChange(baseInput({ domain: "knowledge" }))).rejects.toMatchObject({
      code: "ADMIN_PERMISSION_LOCKED",
    });
    await expect(fx.service.approveChangeRequest(rec.id, "u-noa")).rejects.toMatchObject({
      code: "ADMIN_PERMISSION_LOCKED",
    });
  });

  it("read-only mode blocks the whole workflow", async () => {
    fx.flags.set("read-only-mode", true);
    await expect(fx.service.requestPermissionChange(baseInput())).rejects.toMatchObject({
      code: "ADMIN_READ_ONLY",
    });
  });
});
