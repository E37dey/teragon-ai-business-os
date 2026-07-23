// W6 WIRING — Customer-360 memory tab (Phase 6.17):
// approved-only by default, sensitivity gating (רגיש/מוגבל hidden until an
// explicit reveal with a reason), and the governed proposal path — the button
// creates a PENDING proposal, never an approved record.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/design-system";
import { getRepository } from "@/repositories";
import type { Customer } from "@/domain/types";
import type { MemoryProposal, MemoryRecordV2 } from "@/domain/memory";
import { getMemoryEngine } from "@/memory/core/engine";
import {
  customer360MemoryTabView,
  recurringCustomerIssues,
} from "@/integration/customer360MemoryExtras";
import { Customer360MemoryTab } from "@/modules/customers/Customer360MemoryTab";
import { freshAll, makeV2Record, firstCustomer } from "./helpers";

beforeEach(freshAll);
afterEach(cleanup);

const CUST = { id: "cu-test", name: "לקוח בדיקה בעמ" };

function link(): MemoryRecordV2["entityLinks"] {
  return [{ collection: "customers", entityId: CUST.id, label: CUST.name }];
}

describe("customer360MemoryTabView — approved-only by default", () => {
  it("includes only approved, non-archived records matched to the customer", () => {
    const approved = makeV2Record({ entityLinks: link() });
    const pendingRec = makeV2Record({ entityLinks: link(), approvalState: "ממתין לאישור" });
    const draftRec = makeV2Record({ entityLinks: link(), approvalState: "טיוטה" });
    const rejectedRec = makeV2Record({ entityLinks: link(), approvalState: "נדחה" });
    const archived = makeV2Record({ entityLinks: link(), archivedAt: "2026-07-21T00:00:00Z" });
    const otherCustomer = makeV2Record(); // no link, no mention
    const view = customer360MemoryTabView(
      CUST.id,
      CUST.name,
      [approved, pendingRec, draftRec, rejectedRec, archived, otherCustomer],
      [],
      [],
    );
    expect(view.approved.map((r) => r.id)).toEqual([approved.id]);
  });

  it("bridges legacy records that mention the customer (read-only, honest nulls)", () => {
    const legacy = {
      id: "mem-legacy-1",
      createdAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-01T08:00:00.000Z",
      title: `העדפות תקשורת — ${CUST.name}`,
      markdown: `מעדיפים וואטסאפ. הקשר: ${CUST.name}`,
      frontmatter: {},
      folder: "לקוחות",
      tags: ["תקשורת"],
      links: [],
    };
    const view = customer360MemoryTabView(CUST.id, CUST.name, [legacy], [], []);
    expect(view.approved).toHaveLength(1);
    // no NAMED approval is invented for legacy imports
    expect(view.approved[0]?.approvedBy).toBeNull();
    // tagged "תקשורת" ⇒ derived preference (not invented)
    expect(view.preferences.map((p) => p.id)).toEqual(["mem-legacy-1"]);
  });

  it("gates sensitive records: hiddenByDefault + sensitiveCount, never dropped silently", () => {
    const sensitive = makeV2Record({ entityLinks: link(), sensitivity: "רגיש" });
    const restricted = makeV2Record({ entityLinks: link(), sensitivity: "מוגבל" });
    const internal = makeV2Record({ entityLinks: link(), sensitivity: "פנימי" });
    const view = customer360MemoryTabView(
      CUST.id,
      CUST.name,
      [sensitive, restricted, internal],
      [],
      [],
    );
    expect(view.sensitiveCount).toBe(2);
    const byId = new Map(view.approved.map((r) => [r.id, r]));
    expect(byId.get(sensitive.id)?.hiddenByDefault).toBe(true);
    expect(byId.get(restricted.id)?.hiddenByDefault).toBe(true);
    expect(byId.get(internal.id)?.hiddenByDefault).toBe(false);
  });

  it("derives follow-ups from tagging and observations from proposals", () => {
    const followUp = makeV2Record({
      entityLinks: link(),
      title: "מעקב מובטח — התקנה",
      tags: ["מעקב"],
    });
    const view = customer360MemoryTabView(CUST.id, CUST.name, [followUp], [], []);
    expect(view.followUps.map((f) => f.id)).toEqual([followUp.id]);
    expect(view.observations).toEqual([]);
  });

  it("recurring issues need ≥2 tickets on the same printer", () => {
    const base = {
      createdAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-01T08:00:00.000Z",
      customerId: CUST.id,
      customerName: CUST.name,
      priority: "גבוהה" as const,
      status: "חדש" as const,
      openedAt: "2026-07-01T08:00:00.000Z",
      ownerId: "u-1",
      solution: "",
    };
    const rows = recurringCustomerIssues([
      { ...base, id: "t1", printer: "P1S", issue: "וורפינג" },
      { ...base, id: "t2", printer: "P1S", issue: "סתימה" },
      { ...base, id: "t3", printer: "X1C", issue: "חד פעמי" },
    ] as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ printer: "P1S", count: 2 });
  });
});

function mountTab(customer: Customer) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <Customer360MemoryTab customer={customer} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("Customer360MemoryTab — component", () => {
  it("sensitive record body stays hidden; reveal requires a reason", async () => {
    const customer = await firstCustomer();
    await getRepository<MemoryRecordV2>("memoryRecords").create(
      makeV2Record({
        entityLinks: [{ collection: "customers", entityId: customer.id, label: customer.name }],
        sensitivity: "רגיש",
        title: "פרט רגיש לבדיקה",
        bodyMarkdown: "תוכן-סודי-שאסור-להופיע",
      }),
    );
    mountTab(customer);
    await screen.findByTestId("c360-memory-tab");
    const gate = await screen.findByTestId("c360-sensitive-gate");
    expect(gate).toBeTruthy();
    expect(screen.queryByText("תוכן-סודי-שאסור-להופיע")).toBeNull();
    // the reveal button is disabled until a reason is typed
    const btn = screen.getByRole("button", { name: "חשוף עם נימוק" });
    expect(btn).toHaveProperty("disabled", true);
  });

  it('"הצע הוספה לזיכרון" creates a PENDING proposal — nothing approved directly', async () => {
    const customer = await firstCustomer();
    const recordsBefore = (await getMemoryEngine().stores.records.list()).length;
    mountTab(customer);
    await screen.findByTestId("c360-memory-tab");

    fireEvent.click(screen.getByTestId("c360-propose-btn"));
    const form = await screen.findByTestId("c360-propose-form");
    expect(form).toBeTruthy();
    fireEvent.change(screen.getByLabelText("כותרת הצעת זיכרון"), {
      target: { value: "העדפת בדיקה מהטאב" },
    });
    fireEvent.change(screen.getByLabelText("תוכן הצעת זיכרון"), {
      target: { value: "תוכן תצפית לבדיקת זרימה" },
    });
    fireEvent.click(screen.getByTestId("c360-propose-submit"));

    await waitFor(async () => {
      const proposals = await getRepository<MemoryProposal>("memoryProposals").list();
      const mine = proposals.find((p) => p.draft.title === "העדפת בדיקה מהטאב");
      expect(mine).toBeTruthy();
      expect(mine?.status).toBe("ממתין לאישור");
      expect(mine?.resultRecordId).toBeNull();
    });
    // NO direct permanent write happened
    const recordsAfter = (await getMemoryEngine().stores.records.list()).length;
    expect(recordsAfter).toBe(recordsBefore);
  });
});
