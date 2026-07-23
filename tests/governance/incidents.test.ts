// W8-B — incident management: open → assign → contain → resolve → review →
// close (closure REQUIRES a completed review); real audit-event references only.
import { describe, expect, it } from "vitest";
import {
  assignIncident,
  closeIncident,
  containIncident,
  openIncident,
  resolveIncident,
  reviewIncident,
} from "@/governance";
import { APPROVER, bootedGovernance } from "./helpers";

const REPORTER = { reportedById: "u-noa", reportedByName: "נעה פרידמן" };

describe("incident flow", () => {
  it("runs the full lifecycle with audit records at every step", async () => {
    const fx = await bootedGovernance();
    const incident = await openIncident(
      fx.stores,
      {
        titleHe: "חשד לניסיון הזרקת הוראות",
        descriptionHe: "דפוס ignore-previous זוהה בקלט חופשי והוסגר.",
        severity: "גבוהה",
        relatedAuditEventIds: ["ae-1"], // REAL seeded audit event
        ...REPORTER,
      },
      fx.clock,
    );
    expect(incident.status).toBe("חדש");

    const assigned = await assignIncident(
      fx.stores,
      {
        incidentId: incident.id,
        assignedToId: APPROVER.id,
        assignedToName: APPROVER.name,
        byId: APPROVER.id,
      },
      fx.clock,
    );
    expect(assigned.status).toBe("בטיפול");
    expect(assigned.assignedToName).toBe(APPROVER.name);

    const contained = await containIncident(
      fx.stores,
      { incidentId: incident.id, containmentHe: "הקלט הוסגר והוסר משכבת ההקשר", byId: APPROVER.id },
      fx.clock,
    );
    expect(contained.status).toBe("מוכל");
    expect(contained.containedAt).not.toBeNull();

    const resolved = await resolveIncident(
      fx.stores,
      { incidentId: incident.id, resolutionHe: "נוסף דפוס זיהוי חדש", byId: APPROVER.id },
      fx.clock,
    );
    expect(resolved.status).toBe("נפתר");

    const review = await reviewIncident(
      fx.stores,
      {
        incidentId: incident.id,
        reviewerId: APPROVER.id,
        reviewerName: APPROVER.name,
        summaryHe: "הזיהוי ההיוריסטי עבד; נדרש עדכון דפוסים רבעוני",
        findingsHe: ["הדפוס לא כוסה על ידי הרשימה הקיימת"],
        followUpsHe: ["עדכון רשימת הדפוסים"],
      },
      fx.clock,
    );
    expect(review.subjectRef).toBe(`governance-incident:${incident.id}`);

    const afterReview = await fx.stores.incidents.get(incident.id);
    expect(afterReview?.status).toBe("בתחקיר");
    expect(afterReview?.reviewId).toBe(review.id);
    expect(afterReview?.followUpActionsHe).toContain("עדכון רשימת הדפוסים");

    const closed = await closeIncident(
      fx.stores,
      { incidentId: incident.id, byId: APPROVER.id, byName: APPROVER.name },
      fx.clock,
    );
    expect(closed.status).toBe("סגור");
    expect(closed.closedAt).not.toBeNull();

    const audit = await fx.stores.audit.list();
    const actions = audit
      .filter((a) => a.correlationId === incident.id)
      .map((a) => a.action);
    expect(actions).toEqual([
      "governance.incident-opened",
      "governance.incident-assigned",
      "governance.incident-contained",
      "governance.incident-resolved",
      "governance.incident-reviewed",
      "governance.incident-closed",
    ]);
  });

  it("cannot close without a completed review — no closure without lessons", async () => {
    const fx = await bootedGovernance();
    const incident = await openIncident(
      fx.stores,
      { titleHe: "אירוע", descriptionHe: "תיאור", severity: "נמוכה", ...REPORTER },
      fx.clock,
    );
    await expect(
      closeIncident(
        fx.stores,
        { incidentId: incident.id, byId: APPROVER.id, byName: APPROVER.name },
        fx.clock,
      ),
    ).rejects.toThrow(/תחקיר/);
  });

  it("enforces the step order (no resolve before contain, no contain before assign)", async () => {
    const fx = await bootedGovernance();
    const incident = await openIncident(
      fx.stores,
      { titleHe: "אירוע", descriptionHe: "תיאור", severity: "נמוכה", ...REPORTER },
      fx.clock,
    );
    await expect(
      containIncident(
        fx.stores,
        { incidentId: incident.id, containmentHe: "x", byId: APPROVER.id },
        fx.clock,
      ),
    ).rejects.toThrow(/בטיפול/);
    await expect(
      resolveIncident(
        fx.stores,
        { incidentId: incident.id, resolutionHe: "x", byId: APPROVER.id },
        fx.clock,
      ),
    ).rejects.toThrow(/מוכל/);
  });

  it("rejects a related audit-event reference that does not exist", async () => {
    const fx = await bootedGovernance();
    await expect(
      openIncident(
        fx.stores,
        {
          titleHe: "אירוע",
          descriptionHe: "תיאור",
          severity: "נמוכה",
          relatedAuditEventIds: ["ae-not-real"],
          ...REPORTER,
        },
        fx.clock,
      ),
    ).rejects.toThrow(/אינו קיים/);
  });

  it("bootstrap opens exactly one labeled demo incident referencing real records", async () => {
    const fx = await bootedGovernance();
    const incidents = await fx.stores.incidents.list();
    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.titleHe).toContain("נתוני הדגמה");
    expect(incidents[0]?.relatedAuditEventIds).toEqual(["ae-1"]);
  });
});
