// W6-F — Phase 6.21 GAP-FILL: cross-domain DERIVED surfaces never leak
// sensitive memory bodies.
//
// Existing coverage: the Customer-360 tab gate ("sensitive record body stays
// hidden; reveal requires a reason") and the copilot customer-memory command
// ("sensitive bodies never in the answer"). The remaining unpinned surface is
// the Command-Center memory band: it lists RECENTLY APPROVED records — this
// pins structurally that a sensitive record's body can never reach that band
// (title-only projection), so a rail on a shared screen cannot expose it.
import { describe, expect, it } from "vitest";
import { commandCenterMemoryBand } from "@/integration/commandCenterMemory";

const SENSITIVE_BODY = "BODY-SENTINEL-סודי-אסור-להופיע-ברצועה";

describe("W6-F GAP-FILL — command-center band is a title-only projection", () => {
  it("recentApproved rows carry ONLY {id,title,updatedAt} — a sensitive body cannot leak", () => {
    const band = commandCenterMemoryBand({
      memoryRecords: [
        {
          id: "mrec-s",
          title: "פריט רגיש שאושר",
          updatedAt: "2026-07-22T10:00:00.000Z",
          createdAt: "2026-07-22T10:00:00.000Z",
          memoryLayer: "customer",
          sensitivity: "רגיש",
          approvalState: "מאושר",
          archivedAt: null,
          links: [],
          bodyMarkdown: SENSITIVE_BODY,
          plainText: SENSITIVE_BODY,
        } as never,
      ],
      memoryProposals: [],
      memoryConflicts: [],
      knowledgeConflicts: [],
      knowledgeReviews: [],
      knowledgeUsage: [],
      learningProposals: [],
      todayIso: "2026-07-23T08:00:00.000Z",
    });

    expect(band.recentApproved).toHaveLength(1);
    const row = band.recentApproved[0]!;
    // structural: the projection has exactly the three safe keys
    expect(Object.keys(row).sort()).toEqual(["id", "title", "updatedAt"]);
    // and the serialized band never contains the body sentinel
    expect(JSON.stringify(band)).not.toContain(SENSITIVE_BODY);
  });
});
