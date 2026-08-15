// vNext Phase F — RECORD-SCOPE / IDOR tests.
//
// Route access (portalAccess.rbac.test.ts) proves WHICH modules a portal may open.
// This proves WHICH RECORDS it may see inside them: a student sees only their own
// enrollment, a technician only their own assigned jobs, and neither can reach
// another subject's row by any value they control. The central scopeRecords/
// canSeeRecord policy is the single predicate every surface calls, so testing it
// here pins the behaviour for the homes AND search at once.
import { describe, expect, it } from "vitest";
import { scopeRecords, canSeeRecord, type RecordScope } from "@/authorization/recordScope";
import type { Portal } from "@/authorization/portals";

// minimal row factories (only the fields the policy reads matter).
const row = (id: string, extra: Record<string, unknown>) =>
  ({ id, createdAt: "", updatedAt: "", ...extra }) as never;

const TECH: { portal: Portal; scope: RecordScope } = {
  portal: "technician",
  scope: { ownerId: "u-ran" },
};
const STUDENT: { portal: Portal; scope: RecordScope } = {
  portal: "student",
  scope: { studentId: "st-1" },
};

describe("record scope — TECHNICIAN sees only their OWN assigned jobs", () => {
  const mine = row("t-1", { ownerId: "u-ran" });
  const others = row("t-2", { ownerId: "u-maya" }); // a DIFFERENT technician's job

  it("scopeRecords returns only owned service tickets", () => {
    const out = scopeRecords("serviceTickets", TECH.portal, TECH.scope, [mine, others]);
    expect(out.map((r) => (r as { id: string }).id)).toEqual(["t-1"]);
  });

  it("scopeRecords returns only owned tasks", () => {
    const out = scopeRecords("tasks", TECH.portal, TECH.scope, [mine, others]);
    expect(out).toHaveLength(1);
  });

  it("IDOR: canSeeRecord true for own, FALSE for another technician's job", () => {
    expect(canSeeRecord("serviceTickets", TECH.portal, TECH.scope, mine)).toBe(true);
    expect(canSeeRecord("serviceTickets", TECH.portal, TECH.scope, others)).toBe(false);
  });

  it("a technician cannot read enrollments at all (empty, not all)", () => {
    const en = row("en-1", { studentId: "st-1" });
    expect(scopeRecords("enrollments", TECH.portal, TECH.scope, [en])).toEqual([]);
  });
});

describe("record scope — STUDENT sees only their OWN enrollment", () => {
  const mine = row("en-1", { studentId: "st-1" });
  const others = row("en-2", { studentId: "st-2" }); // a DIFFERENT student

  it("scopeRecords returns only the student's own enrollment", () => {
    const out = scopeRecords("enrollments", STUDENT.portal, STUDENT.scope, [mine, others]);
    expect(out.map((r) => (r as { id: string }).id)).toEqual(["en-1"]);
  });

  it("IDOR: canSeeRecord true for own, FALSE for another student's enrollment", () => {
    expect(canSeeRecord("enrollments", STUDENT.portal, STUDENT.scope, mine)).toBe(true);
    expect(canSeeRecord("enrollments", STUDENT.portal, STUDENT.scope, others)).toBe(false);
  });

  it("a student has no operational tasks or tickets (empty, not all)", () => {
    const task = row("t-1", { ownerId: "u-ran" });
    const ticket = row("s-1", { ownerId: "u-ran" });
    expect(scopeRecords("tasks", STUDENT.portal, STUDENT.scope, [task])).toEqual([]);
    expect(scopeRecords("serviceTickets", STUDENT.portal, STUDENT.scope, [ticket])).toEqual([]);
  });
});

describe("record scope — a missing/empty scope never leaks another subject's rows", () => {
  it("technician with no ownerId sees nothing (fail-closed)", () => {
    const rows = [row("t-1", { ownerId: "u-ran" }), row("t-2", { ownerId: "u-maya" })];
    expect(scopeRecords("serviceTickets", "technician", null, rows)).toEqual([]);
    expect(scopeRecords("serviceTickets", "technician", {}, rows)).toEqual([]);
  });

  it("student with no studentId sees no enrollment (fail-closed)", () => {
    const rows = [row("en-1", { studentId: "st-1" })];
    expect(scopeRecords("enrollments", "student", null, rows)).toEqual([]);
    expect(scopeRecords("enrollments", "student", {}, rows)).toEqual([]);
  });
});

describe("record scope — MANAGER is broad (org-scoped upstream, not per-owner)", () => {
  const rows = [row("t-1", { ownerId: "u-ran" }), row("t-2", { ownerId: "u-maya" })];
  it("manager sees the full set for operational collections", () => {
    expect(scopeRecords("serviceTickets", "manager", null, rows)).toHaveLength(2);
    expect(scopeRecords("tasks", "manager", null, rows)).toHaveLength(2);
    expect(scopeRecords("approvals", "manager", null, rows)).toHaveLength(2);
  });
});
