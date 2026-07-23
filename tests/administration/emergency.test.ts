// W8-C — emergency controls: record + flag + audit per activation; agent
// disable reuses the W5-D mechanism; honest scope statements; read-only /
// permission-lock enforcement within the module; access reviews.
import { beforeEach, describe, expect, it } from "vitest";
import { freshFixture, type Fixture } from "./helpers";

let fx: Fixture;

beforeEach(async () => {
  fx = freshFixture();
  await fx.service.ensureBaseline();
});

describe("agent-disable (reuses the W5-D mechanism)", () => {
  it("disables the agent record, writes an emergency record + audit, then re-enables", async () => {
    const rec = await fx.service.activateEmergencyControl({
      control: "agent-disable",
      targetAgentId: "ag-hunter",
      actorId: "u-tzachi",
      actorName: "צחי זוסטייהם",
      reasonHe: "התנהגות חריגה בבדיקה",
    });
    expect(rec.state).toBe("פעיל");
    expect(rec.targetRef).toBe("agent:ag-hunter");
    expect((await fx.stores.agents.get("ag-hunter"))?.status).toBe("מושבת");
    const audit = await fx.service.listAdminAudit();
    expect(audit.some((a) => a.action === "admin.emergency.activate")).toBe(true);

    const off = await fx.service.deactivateEmergencyControl(rec.id, "u-tzachi", "צחי זוסטייהם");
    expect(off.state).toBe("בוטל");
    expect(off.deactivatedAt).not.toBeNull();
    expect((await fx.stores.agents.get("ag-hunter"))?.status).toBe("פעיל");
    expect((await fx.service.listAdminAudit()).some((a) => a.action === "admin.emergency.deactivate")).toBe(true);
  });

  it("unknown agent id fails honestly", async () => {
    await expect(
      fx.service.activateEmergencyControl({
        control: "agent-disable",
        targetAgentId: "ag-missing",
        actorId: "u-tzachi",
        actorName: "צחי",
        reasonHe: "בדיקה",
      }),
    ).rejects.toMatchObject({ code: "ADMIN_NOT_FOUND" });
  });
});

describe("flag-backed controls", () => {
  it("read-only-mode sets the flag and the module refuses mutations until deactivated", async () => {
    const rec = await fx.service.activateEmergencyControl({
      control: "read-only-mode",
      actorId: "u-tzachi",
      actorName: "צחי זוסטייהם",
      reasonHe: "תחזוקה",
    });
    expect(fx.flags.isActive("read-only-mode")).toBe(true);
    await expect(
      fx.service.createDemoUser({
        name: "x",
        email: "x@x",
        phone: "0",
        legacyRole: "תלמיד",
        actorId: "u-noa",
        actorName: "נעה",
      }),
    ).rejects.toMatchObject({ code: "ADMIN_READ_ONLY" });
    await expect(fx.service.suspendUser("u-maya", "u-noa", "x")).rejects.toMatchObject({
      code: "ADMIN_READ_ONLY",
    });
    // deactivation is allowed even in read-only (it IS the emergency system)
    await fx.service.deactivateEmergencyControl(rec.id, "u-tzachi", "צחי זוסטייהם");
    expect(fx.flags.isActive("read-only-mode")).toBe(false);
    const user = await fx.service.createDemoUser({
      name: "אחרי ביטול",
      email: "after@x",
      phone: "0",
      legacyRole: "תלמיד",
      actorId: "u-noa",
      actorName: "נעה",
    });
    expect(user.id).toBe("u-demo-1");
  });

  it("permission-change-lock blocks the workflow but NOT user management", async () => {
    await fx.service.activateEmergencyControl({
      control: "permission-change-lock",
      actorId: "u-tzachi",
      actorName: "צחי זוסטייהם",
      reasonHe: "חקירת אירוע",
    });
    await expect(
      fx.service.requestPermissionChange({
        kind: "user-override",
        targetId: "u-maya",
        domain: "service",
        newLevel: "write",
        requestedById: "u-tzachi",
        requestedByName: "צחי",
        approverId: "u-noa",
        approverName: "נעה",
      }),
    ).rejects.toMatchObject({ code: "ADMIN_PERMISSION_LOCKED" });
    // user display edits are not permission changes — still allowed
    const u = await fx.service.updateUserDisplay("u-maya", { phone: "050-9999999" }, "u-noa");
    expect(u.phone).toBe("050-9999999");
  });

  it("remote-ai-disable is honest about being display-only in Mode A", async () => {
    const rec = await fx.service.activateEmergencyControl({
      control: "remote-ai-disable",
      actorId: "u-tzachi",
      actorName: "צחי זוסטייהם",
      reasonHe: "זהירות",
    });
    expect(rec.honestScopeHe).toContain("תצוגה בלבד");
    expect(fx.flags.isActive("remote-ai-disable")).toBe(true);
  });

  it("automation-execution-disable writes the flag + honest wiring note", async () => {
    const rec = await fx.service.activateEmergencyControl({
      control: "automation-execution-disable",
      actorId: "u-tzachi",
      actorName: "צחי זוסטייהם",
      reasonHe: "ריצה כפולה",
    });
    expect(fx.flags.isActive("automation-execution-disable")).toBe(true);
    expect(rec.honestScopeHe).toContain("integration-requests-w8c");
  });
});

describe("emergency guards", () => {
  it("an AI agent can never activate a control", async () => {
    await expect(
      fx.service.activateEmergencyControl({
        control: "read-only-mode",
        actorId: "ag-orchestrator",
        actorName: "Orchestrator",
        reasonHe: "x",
      }),
    ).rejects.toMatchObject({ code: "ADMIN_AI_ACTOR_FORBIDDEN" });
  });

  it("activation without a reason is rejected by the schema", async () => {
    await expect(
      fx.service.activateEmergencyControl({
        control: "read-only-mode",
        actorId: "u-tzachi",
        actorName: "צחי",
        reasonHe: "",
      }),
    ).rejects.toThrow();
  });

  it("a cancelled record cannot be cancelled twice", async () => {
    const rec = await fx.service.activateEmergencyControl({
      control: "read-only-mode",
      actorId: "u-tzachi",
      actorName: "צחי",
      reasonHe: "בדיקה",
    });
    await fx.service.deactivateEmergencyControl(rec.id, "u-tzachi", "צחי");
    await expect(
      fx.service.deactivateEmergencyControl(rec.id, "u-tzachi", "צחי"),
    ).rejects.toMatchObject({ code: "ADMIN_STATE_INVALID" });
  });
});

describe("access reviews", () => {
  it("a named human decides a pending review; self-review is blocked", async () => {
    const reviews = await fx.service.listAccessReviews();
    const mayaReview = reviews.find((r) => r.userId === "u-maya");
    expect(mayaReview?.status).toBe("ממתין");
    const decided = await fx.service.decideAccessReview(
      mayaReview?.id ?? "",
      "אושר",
      "u-tzachi",
      "צחי זוסטייהם",
      "הגישה נדרשת לתפקיד",
    );
    expect(decided.status).toBe("אושר");
    expect(decided.decidedByName).toBe("צחי זוסטייהם");
    const tzachiReview = reviews.find((r) => r.userId === "u-tzachi");
    await expect(
      fx.service.decideAccessReview(tzachiReview?.id ?? "", "אושר", "u-tzachi", "צחי", "x"),
    ).rejects.toMatchObject({ code: "ADMIN_SELF_APPROVAL_FORBIDDEN" });
    await expect(
      fx.service.decideAccessReview(mayaReview?.id ?? "", "אושר", "u-tzachi", "צחי", "שוב"),
    ).rejects.toMatchObject({ code: "ADMIN_STATE_INVALID" });
  });

  it("an AI agent can never decide a review", async () => {
    const reviews = await fx.service.listAccessReviews();
    const anyReview = reviews.find((r) => r.status === "ממתין");
    await expect(
      fx.service.decideAccessReview(anyReview?.id ?? "", "אושר", "ag-wiki", "Wiki", "x"),
    ).rejects.toMatchObject({ code: "ADMIN_AI_ACTOR_FORBIDDEN" });
  });
});
