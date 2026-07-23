// W8-B — /governance pure page selectors. Every number derives from records;
// nothing is invented. Separated from the component for direct unit testing.
import type { Approval, AuditEvent } from "@/domain/types";
import type {
  GovernanceIncident,
  GovernancePolicy,
  GovernanceRisk,
  PromptVersionRecord,
} from "@/domain/governance";
import type { GovernanceFinding } from "@/governance";

export interface GovernanceMetrics {
  activePolicies: number;
  pendingPolicies: number;
  draftPolicies: number;
  openRisks: number;
  criticalOpenRisks: number;
  openIncidents: number;
  pendingApprovals: number;
  auditEvents: number;
  promptVersions: number;
  findings: number;
  severeFindings: number;
}

export function governanceMetrics(input: {
  policies: readonly GovernancePolicy[];
  risks: readonly GovernanceRisk[];
  incidents: readonly GovernanceIncident[];
  approvals: readonly Approval[];
  audit: readonly AuditEvent[];
  promptVersions: readonly PromptVersionRecord[];
  findings: readonly GovernanceFinding[];
}): GovernanceMetrics {
  const closedRiskStates = new Set(["נסגר", "הופחת"]);
  return {
    activePolicies: input.policies.filter((p) => p.status === "פעילה").length,
    pendingPolicies: input.policies.filter((p) => p.status === "ממתין לבדיקה").length,
    draftPolicies: input.policies.filter((p) => p.status === "טיוטה").length,
    openRisks: input.risks.filter((r) => !closedRiskStates.has(r.status)).length,
    criticalOpenRisks: input.risks.filter(
      (r) => r.severity === "קריטית" && !closedRiskStates.has(r.status),
    ).length,
    openIncidents: input.incidents.filter((i) => i.status !== "סגור").length,
    pendingApprovals: input.approvals.filter((a) => a.status === "ממתין").length,
    auditEvents: input.audit.length,
    promptVersions: input.promptVersions.length,
    findings: input.findings.length,
    severeFindings: input.findings.filter((f) => f.severityHe === "חמור").length,
  };
}

/** Sorted policy rows — pending first, then drafts, then active/archived. */
export function policyRows(policies: readonly GovernancePolicy[]): GovernancePolicy[] {
  const order: Record<string, number> = { "ממתין לבדיקה": 0, טיוטה: 1, פעילה: 2, בארכיון: 3 };
  return [...policies].sort(
    (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.id.localeCompare(b.id),
  );
}

/** Sorted risk rows — critical/high open first. */
export function riskRows(risks: readonly GovernanceRisk[]): GovernanceRisk[] {
  const sevOrder: Record<string, number> = { קריטית: 0, גבוהה: 1, בינונית: 2, נמוכה: 3 };
  const closed = new Set(["נסגר", "הופחת"]);
  return [...risks].sort((a, b) => {
    const aClosed = closed.has(a.status) ? 1 : 0;
    const bClosed = closed.has(b.status) ? 1 : 0;
    return (
      aClosed - bClosed ||
      (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9) ||
      a.id.localeCompare(b.id)
    );
  });
}

/** Incident rows — open first, newest first inside each group. */
export function incidentRows(incidents: readonly GovernanceIncident[]): GovernanceIncident[] {
  return [...incidents].sort((a, b) => {
    const aClosed = a.status === "סגור" ? 1 : 0;
    const bClosed = b.status === "סגור" ? 1 : 0;
    return aClosed - bClosed || (a.openedAt < b.openedAt ? 1 : -1) || a.id.localeCompare(b.id);
  });
}
