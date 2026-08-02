// Gate S4 — atomic multi-row write via a single Postgres RPC (service domain).
import { beforeEach, describe, expect, it } from "vitest";
import { closeTicketWithRepair, type CloseTicketWithRepairInput } from "@/persistence/supabase/domains/service";
import type { DbRow } from "@/persistence/supabase/db";
import { MockSupabase } from "./mockSupabase";

const input: CloseTicketWithRepairInput = {
  ticketId: "st-1",
  solution: "הוחלף חלק",
  closedAt: "2026-07-30",
  repair: {
    id: "ra-1",
    description: "החלפת אקסטרודר",
    performedById: "u-2",
    performedAt: "2026-07-30",
    partsCost: 120,
  },
};

describe("atomic RPC boundary — close_ticket_with_repair", () => {
  let mock: MockSupabase;
  beforeEach(() => {
    mock = new MockSupabase();
    mock.seed("service_tickets", [
      { id: "st-1", organization_id: "org-1", status: "בבדיקה", solution: "", closed_at: null } as DbRow,
    ]);
  });

  it("commits ticket-close AND repair insert in one call (single transaction)", async () => {
    mock.onRpc("close_ticket_with_repair", (args) => {
      // The DB function performs BOTH writes atomically; the mock mirrors that as
      // one indivisible handler (never two separate client round-trips).
      const ticket = mock.tables.get("service_tickets")?.get(String(args.p_ticket_id));
      if (ticket) {
        ticket.status = "נסגר";
        ticket.solution = args.p_solution;
        ticket.closed_at = args.p_closed_at;
      }
      mock.seed("repair_actions", [
        { id: String(args.p_repair_id), organization_id: String(args.p_organization_id), ticket_id: String(args.p_ticket_id) },
      ]);
      return { data: { ticket_id: args.p_ticket_id }, error: null };
    });

    const res = await closeTicketWithRepair(mock, "org-1", input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.ticketId).toBe("st-1");
    expect(mock.tables.get("service_tickets")?.get("st-1")?.status).toBe("נסגר");
    expect(mock.tables.get("repair_actions")?.has("ra-1")).toBe(true);
  });

  it("maps an RPC transaction failure to a safe error (never throws, no partial write)", async () => {
    mock.onRpc("close_ticket_with_repair", () => ({ data: null, error: { code: "23503", message: "fk" } }));
    const res = await closeTicketWithRepair(mock, "org-1", input);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("conflict");
    // rolled back: nothing changed
    expect(mock.tables.get("service_tickets")?.get("st-1")?.status).toBe("בבדיקה");
    expect(mock.tables.get("repair_actions")).toBeUndefined();
  });
});
