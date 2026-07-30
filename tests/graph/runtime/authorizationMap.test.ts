// TERAGON Business Graph — Phase 10 RUNTIME authorization-mapping tests.
// Proves the explicit closed role → graph capability mapping: every canonical role
// has an entry; graph access is an explicit elevated gate (not implied by CRM read);
// a mapped role receives ONLY its mapped domains; unmapped/ineligible roles are
// denied; permitted queries are derived from the real authorization matrix.
import { describe, expect, it } from "vitest";
import {
  RUNTIME_GRAPH_ROLE_GRANTS,
  graphCapabilityForRole,
  isCanonicalRoleId,
  roleMayRunQuery,
} from "@/graph";
import { CANONICAL_ROLE_IDS } from "@/domain/administration/types";
import { can } from "@/authorization/matrix";

describe("runtime authorization mapping", () => {
  it("has an explicit entry for every one of the 9 canonical roles", () => {
    for (const roleId of CANONICAL_ROLE_IDS) {
      expect(RUNTIME_GRAPH_ROLE_GRANTS[roleId]).toBeDefined();
    }
    expect(Object.keys(RUNTIME_GRAPH_ROLE_GRANTS).sort()).toEqual([...CANONICAL_ROLE_IDS].sort());
  });

  it("denies an unknown / non-canonical role (deny-by-default)", () => {
    expect(isCanonicalRoleId("crole-nope")).toBe(false);
    expect(graphCapabilityForRole("crole-nope")).toBeNull();
    expect(graphCapabilityForRole("")).toBeNull();
    expect(roleMayRunQuery("crole-nope", "findCustomersNeedingFollowUp")).toBe(false);
  });

  it("does NOT grant graph access merely because a role can open a CRM screen (viewer)", () => {
    // crole-viewer holds customer.read (can open CRM screens) …
    expect(can("crole-viewer", "customer.read")).toBe(true);
    // … but is explicitly NOT graph-eligible ⇒ no graph capability at all.
    expect(RUNTIME_GRAPH_ROLE_GRANTS["crole-viewer"].graphEligible).toBe(false);
    expect(graphCapabilityForRole("crole-viewer")).toBeNull();
    expect(roleMayRunQuery("crole-viewer", "findCustomersNeedingFollowUp")).toBe(false);
  });

  it("gives sysadmin/ceo/auditor the full evidence + stale capability", () => {
    for (const roleId of ["crole-sysadmin", "crole-ceo", "crole-auditor"] as const) {
      const cap = graphCapabilityForRole(roleId);
      expect(cap).not.toBeNull();
      expect(cap!.allowEvidencePath).toBe(true);
      expect(cap!.allowStaleGraph).toBe(true);
      expect(cap!.permittedQueries).toContain("buildFullEvidencePath");
    }
  });

  it("maps a role to ONLY its mapped entity domains (sales)", () => {
    const cap = graphCapabilityForRole("crole-sales");
    expect(cap).not.toBeNull();
    expect(cap!.domains).not.toBeNull();
    expect(cap!.domains).toContain("customer");
    expect(cap!.domains).toContain("quotation");
    // sales is scoped away from course/enrollment/governance domains.
    expect(cap!.domains).not.toContain("course");
    expect(cap!.domains).not.toContain("enrollment");
    expect(cap!.domains).not.toContain("governancePolicy");
    // narrow clearance, no stale, no evidence path.
    expect(cap!.clearanceCeiling).toBe("פנימי");
    expect(cap!.allowStaleGraph).toBe(false);
    expect(cap!.allowEvidencePath).toBe(false);
    expect(cap!.permittedQueries).not.toContain("buildFullEvidencePath");
  });

  it("derives permitted queries from the real product-permission matrix", () => {
    // service holds service.read ⇒ recurring-issues + printer-impact; NOT sales.read.
    const service = graphCapabilityForRole("crole-service");
    expect(service).not.toBeNull();
    expect(service!.permittedQueries).toContain("findRecurringServiceIssues");
    expect(service!.permittedQueries).toContain("assessPrinterModelSupportImpact");
    expect(service!.permittedQueries).not.toContain("findUnansweredQuotations");

    // instructor manages courses ⇒ delayed enrollments; not service queries.
    const instructor = graphCapabilityForRole("crole-instructor");
    expect(instructor).not.toBeNull();
    expect(instructor!.permittedQueries).toContain("findDelayedEnrollments");
    expect(instructor!.permittedQueries).not.toContain("findRecurringServiceIssues");
  });

  it("gates historical + evidence queries behind their explicit grant, not just permission", () => {
    // champion holds knowledge.review AND has historical grant ⇒ superseded evidence.
    expect(can("crole-champion", "knowledge.review")).toBe(true);
    expect(graphCapabilityForRole("crole-champion")!.permittedQueries).toContain("findSupersededEvidence");
    // bizmgr holds knowledge.review + historical grant ⇒ superseded; but no evidence path.
    const biz = graphCapabilityForRole("crole-bizmgr")!;
    expect(biz.permittedQueries).toContain("findSupersededEvidence");
    expect(biz.permittedQueries).not.toContain("buildFullEvidencePath");
  });

  it("only sysadmin/ceo/auditor may traverse a stale graph", () => {
    const staleRoles = CANONICAL_ROLE_IDS.filter((r) => {
      const cap = graphCapabilityForRole(r);
      return cap !== null && cap.allowStaleGraph;
    });
    expect(staleRoles.sort()).toEqual(["crole-auditor", "crole-ceo", "crole-sysadmin"]);
  });
});
