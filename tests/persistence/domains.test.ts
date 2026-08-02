// Gate S4 — one representative round-trip per domain group, proving the mapping
// registry covers all eight domains (identity, CRM, products+printers, service,
// training, tasks+approvals, knowledge+memory, governance+audit).
import { describe, expect, it } from "vitest";
import type { BaseEntity } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import { SupabaseRepository } from "@/persistence/supabase/SupabaseRepository";
import { getMapping } from "@/persistence/supabase/registry";
import { MockSupabase } from "./mockSupabase";

const ISO = "2026-07-22T08:00:00.000Z";
const base = { createdAt: ISO, updatedAt: ISO };

interface Case {
  domain: string;
  collection: CollectionKey;
  table: string;
  entity: BaseEntity & Record<string, unknown>;
  /** a snake_case column that must appear on the stored row. */
  snakeCol: string;
  /** a camelCase field that must appear on the read-back entity. */
  camelField: string;
}

const CASES: Case[] = [
  {
    domain: "identity",
    collection: "organizations",
    table: "organizations",
    snakeCol: "name",
    camelField: "status",
    entity: { id: "org-1", ...base, name: "טרגון", type: "עסק", phone: "", email: "", city: "", notes: "", status: "פעיל" },
  },
  {
    domain: "crm",
    collection: "leads",
    table: "leads",
    snakeCol: "owner_id",
    camelField: "ownerId",
    entity: { id: "ld-1", ...base, name: "ליד", phone: "", email: "", source: "", interest: "", status: "חדש", ownerId: "u-1", followUp: "2026-08-01", notes: "", history: [] },
  },
  {
    domain: "products+printers",
    collection: "products",
    table: "products",
    snakeCol: "active",
    camelField: "active",
    entity: { id: "pr-1", ...base, name: "מוצר", category: "קורס", description: "", price: 0, active: true },
  },
  {
    domain: "service",
    collection: "serviceTickets",
    table: "service_tickets",
    snakeCol: "customer_name",
    camelField: "customerName",
    entity: { id: "st-1", ...base, customerName: "לקוח", customerId: null, printer: "", issue: "תקלה", description: "", priority: "בינונית", status: "חדש", openedAt: "2026-07-01", ownerId: "u-1", solution: "" },
  },
  {
    domain: "training",
    collection: "courses",
    table: "courses",
    snakeCol: "start_date",
    camelField: "start",
    entity: { id: "co-1", ...base, name: "קורס", type: "", start: "2026-01-01", end: "2026-02-01", price: 0, status: "פעיל", zoom: "", instructorId: "u-1", isAI: false, blurb: "" },
  },
  {
    domain: "tasks+approvals",
    collection: "approvals",
    table: "approvals",
    snakeCol: "requested_by_id",
    camelField: "requestedById",
    entity: { id: "ap-1", ...base, subjectRef: "agent-task:at-1", requestedById: "u-1", requestedAt: ISO, status: "ממתין", decidedById: null, decidedAt: null, note: "" },
  },
  {
    domain: "knowledge+memory",
    collection: "memoryRecords",
    table: "memory_records",
    snakeCol: "frontmatter",
    camelField: "frontmatter",
    entity: { id: "mem-1", ...base, title: "זיכרון", markdown: "", frontmatter: { k: "v" }, folder: "", tags: [], links: [] },
  },
  {
    domain: "governance+audit",
    collection: "agents",
    table: "agents",
    snakeCol: "prompt_version",
    camelField: "promptVersion",
    entity: { id: "ag-1", ...base, name: "סוכן", purpose: "p", allowedTools: [], allowedDomains: [], prohibitedDomains: [], promptVersion: "v1", limits: { maxTasksPerDay: 1, maxActionsPerTask: 1, dailyBudgetILS: 0 }, status: "פעיל" },
  },
];

describe("domain adapter coverage — round-trip per domain group", () => {
  for (const c of CASES) {
    it(`${c.domain}: ${c.collection} entity ↔ ${c.table} row`, async () => {
      const mock = new MockSupabase();
      const mapping = getMapping(c.collection);
      expect(mapping, `mapping registered for ${c.collection}`).toBeTruthy();
      if (!mapping) return;
      const repo = new SupabaseRepository<BaseEntity>(mock, mapping, "org-1");

      const created = await repo.createSafe(c.entity);
      expect(created.ok, `create ${c.collection}`).toBe(true);

      const stored = mock.tables.get(c.table)?.get(c.entity.id);
      expect(stored, `stored row in ${c.table}`).toBeTruthy();
      expect(stored).toHaveProperty(c.snakeCol);
      // tenant tables carry organization_id; the global root (organizations) must not.
      if (mapping.tenant === false) expect(stored).not.toHaveProperty("organization_id");
      else expect(stored?.organization_id).toBe("org-1");

      const read = await repo.getSafe(c.entity.id);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(read.data).toHaveProperty(c.camelField);
      expect(read.data?.id).toBe(c.entity.id);
    });
  }

  it("the registry exposes exactly the eight domain groups' collections (spot check)", () => {
    for (const c of CASES) expect(getMapping(c.collection)).toBeTruthy();
  });
});
