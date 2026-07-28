// TERAGON Business Graph — centralized edge-authority policy (Phase 2.1).
// One place decides an edge's GraphAuthority from the static provenance PLUS the
// runtime facts (registry, eligibility, target existence, org match, archival,
// rejection, ambiguity, approval). The invariants live HERE, never scattered:
//   • INFERRED can never be CANONICAL (capped at DERIVED);
//   • PROPOSED stays UNVERIFIED until a named human approval re-classifies it;
//   • a REJECTED source / rejected approval is never authoritative;
//   • name/substring/ambiguous resolution caps authority at UNVERIFIED;
//   • FOREIGN_KEY_DERIVED may reach CANONICAL, but ONLY when all six conditions
//     hold — otherwise it degrades to DERIVED or UNVERIFIED per what failed;
//   • a broken/missing FK yields a NON-authoritative result: the CALLER should
//     emit an issue and NOT create an edge — this policy only classifies.
// See EDGE_MAP §2 and SECURITY_MODEL §4/§5.
import type { GraphAuthority, GraphEdgeApprovalState, GraphProvenance } from "./edge";

// ---------------------------------------------------------------------------
// policy input / output
// ---------------------------------------------------------------------------

/**
 * The static + runtime facts a caller collects for one candidate edge. All
 * runtime facts are supplied by the caller — the contract layer cannot read the
 * repositories, so it never fetches: it only classifies from what it is given.
 */
export interface EdgeAuthorityInput {
  /** static provenance of the candidate edge */
  provenance: GraphProvenance;
  /** the registry marks the source field/relationship as an authoritative relationship */
  registryAuthoritative: boolean;
  /** the source record is canonical and eligible to be a graph source */
  sourceEligible: boolean;
  /** the target record actually exists (a false here means a broken/missing FK) */
  targetExists: boolean;
  /** source and target share the same organizationId */
  sameOrganization: boolean;
  /** the source record is archived */
  sourceArchived: boolean;
  /** the source record is rejected */
  sourceRejected: boolean;
  /** the source record is otherwise invalid (optional; defaults false) */
  sourceInvalid?: boolean;
  /** a name/substring/ambiguous resolution was used to find the target */
  ambiguousResolution: boolean;
  /** the human-approval state of the edge */
  approvalState: GraphEdgeApprovalState;
}

export interface EdgeAuthorityDecision {
  authority: GraphAuthority;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// centralized policy
// ---------------------------------------------------------------------------

/**
 * The single source of truth for an edge's authority. Deny-by-default: the only
 * way to reach CANONICAL is to satisfy every condition for the provenance in
 * question. Returns the decided authority plus human-readable Hebrew reasons.
 */
export function resolveEdgeAuthority(input: EdgeAuthorityInput): EdgeAuthorityDecision {
  const reasons: string[] = [];
  const sourceInvalid = input.sourceInvalid ?? false;

  // (1) Rejected source / rejected approval is terminal — never authoritative.
  if (input.sourceRejected || input.approvalState === "rejected") {
    reasons.push("מקור/אישור נדחה (REJECTED) — לעולם אינו סמכותי");
    return { authority: "REJECTED", reasons };
  }

  // (2) PROPOSED stays UNVERIFIED until a named human approval re-classifies it
  //     (approval promotes the edge by re-provenancing it elsewhere, not here).
  if (input.provenance === "PROPOSED") {
    reasons.push(
      input.approvalState === "approved"
        ? "קשת מוצעת שאושרה — הסמכות תיקבע מחדש עם שינוי הפרובננס; עד אז UNVERIFIED"
        : "קשת מוצעת (PROPOSED) נשארת UNVERIFIED עד אישור אנושי בשם",
    );
    return { authority: "UNVERIFIED", reasons };
  }

  // Collect condition failures (shared by INFERRED / EXPLICIT / FK_DERIVED).
  const failures: string[] = [];
  if (!input.targetExists) failures.push("צומת היעד אינו קיים (FK שבור/חסר) — יש לפלוט issue ולא ליצור קשת");
  if (!input.sameOrganization) failures.push("מקור ויעד אינם באותו ארגון");
  if (!input.sourceEligible) failures.push("רשומת המקור אינה קנונית/כשירה");
  if (input.sourceArchived) failures.push("רשומת המקור בארכיון");
  if (sourceInvalid) failures.push("רשומת המקור אינה תקינה");

  // (3) Ambiguous / name / substring resolution caps authority at UNVERIFIED.
  if (input.ambiguousResolution) {
    reasons.push("רזולוציה רב-משמעית/מבוססת-שם — הסמכות מוגבלת ל-UNVERIFIED");
    reasons.push(...failures);
    return { authority: "UNVERIFIED", reasons };
  }

  // Failures that drop authority to UNVERIFIED (vs. merely DERIVED).
  const unverifiedFailure =
    !input.targetExists || !input.sameOrganization || !input.sourceEligible || sourceInvalid;

  // (4) INFERRED can never be CANONICAL — capped at DERIVED.
  if (input.provenance === "INFERRED") {
    if (unverifiedFailure) {
      reasons.push("קשת מוסקת (INFERRED) לא-כשירה — UNVERIFIED");
      reasons.push(...failures);
      return { authority: "UNVERIFIED", reasons };
    }
    reasons.push("קשת מוסקת (INFERRED) — לכל היותר DERIVED, לעולם לא CANONICAL");
    if (failures.length > 0) reasons.push(...failures);
    return { authority: "DERIVED", reasons };
  }

  // (5) EXPLICIT / FOREIGN_KEY_DERIVED may reach CANONICAL.
  //     EXPLICIT is authoritative by construction; FK_DERIVED additionally
  //     requires the registry to mark the relationship authoritative.
  const registryOk = input.provenance === "EXPLICIT" || input.registryAuthoritative;
  const canonicalEligible =
    input.targetExists &&
    input.sameOrganization &&
    input.sourceEligible &&
    !input.sourceArchived &&
    !sourceInvalid &&
    registryOk;

  if (canonicalEligible) {
    reasons.push(
      input.provenance === "EXPLICIT"
        ? "קשת EXPLICIT כשירה במלואה — CANONICAL"
        : "קשת FOREIGN_KEY_DERIVED עומדת בכל שש התנאים — CANONICAL",
    );
    return { authority: "CANONICAL", reasons };
  }

  if (input.provenance === "FOREIGN_KEY_DERIVED" && !input.registryAuthoritative) {
    failures.push("הרלציה אינה מסומנת כסמכותית ברישום (registry) — אינה יכולה להיות CANONICAL");
  }

  if (unverifiedFailure) {
    reasons.push("תנאי סמכות מהותי נכשל — UNVERIFIED");
    reasons.push(...failures);
    return { authority: "UNVERIFIED", reasons };
  }

  // Remaining failures (archived source, or FK without registry authority) keep
  // a real-but-not-canonical link → DERIVED.
  reasons.push("קשת נגזרת ללא כל תנאי CANONICAL — DERIVED");
  reasons.push(...failures);
  return { authority: "DERIVED", reasons };
}
