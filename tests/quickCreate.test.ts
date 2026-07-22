// Quick-create integration: creating a lead through the canonical action makes
// it immediately visible to the global search AND refreshes the derived data
// path used by badges/notifications (repository → selector chain).
import { beforeEach, describe, expect, it } from "vitest";
import { createLead, createTicket, leadInputSchema } from "@/app/quick-create/actions";
import { rankedSearch, openTicketCount } from "@/domain/selectors";
import { getRepository, __resetRepositoriesForTests } from "@/repositories";
import type { Lead, ServiceTicket } from "@/domain/types";

// jsdom test env has no indexedDB ⇒ the factory serves seeded InMemory repos.

describe("quick-create actions (repository integration)", () => {
  beforeEach(() => {
    __resetRepositoriesForTests();
  });

  it("createLead validates, persists, and the lead appears in global search", async () => {
    const lead = await createLead({
      name: "בדיקת אינטגרציה",
      phone: "050-0000000",
      email: "integration@test.co",
      source: "אתר",
      interest: "קורס בדיקות",
      notes: "",
    });
    expect(lead.id).toMatch(/^l-\d+$/);
    expect(lead.status).toBe("חדש");

    const leads = await getRepository<Lead>("leads").list();
    expect(leads.some((l) => l.id === lead.id)).toBe(true);

    const hits = rankedSearch({ leads }, "בדיקת אינטגרציה");
    expect(hits[0]?.kind).toBe("ליד");
    expect(hits[0]?.id).toBe(lead.id);
    expect(hits[0]?.matchedField).toBe("שם");
  });

  it("createTicket increases the derived service badge count by exactly 1", async () => {
    const before = openTicketCount(await getRepository<ServiceTicket>("serviceTickets").list());
    await createTicket({
      customerName: "לקוח בדיקה",
      printer: "Bambu Lab A1",
      issue: "תקלה לבדיקה",
      description: "",
      priority: "גבוהה",
    });
    const after = openTicketCount(await getRepository<ServiceTicket>("serviceTickets").list());
    expect(after).toBe(before + 1);
  });

  it("ids are deterministic (next numeric suffix, no Math.random)", async () => {
    const existing = await getRepository<Lead>("leads").list();
    const maxSuffix = Math.max(
      ...existing.map((l) => Number.parseInt(l.id.replace(/^l-/, ""), 10)).filter(Number.isFinite),
    );
    const lead = await createLead({
      name: "ליד עוקב",
      phone: "050-1111111",
      email: "",
      source: "טלפון",
      interest: "בדיקה",
      notes: "",
    });
    expect(lead.id).toBe(`l-${maxSuffix + 1}`);
  });

  it("input schema rejects missing required fields with Hebrew errors", () => {
    const bad = leadInputSchema.safeParse({
      name: "",
      phone: "",
      email: "",
      source: "",
      interest: "",
      notes: "",
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const messages = bad.error.issues.map((i) => i.message);
      expect(messages).toContain("שם הליד הוא שדה חובה");
      expect(messages).toContain("טלפון הוא שדה חובה");
    }
  });
});
