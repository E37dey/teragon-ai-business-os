import { describe, expect, it } from "vitest";
import {
  agingAlerts,
  conversionRate,
  EMPTY_FILTERS,
  filterLeads,
  hottestLeads,
  leadSources,
  newThisWeek,
} from "@/modules/crm/selectors";
import { loadSavedViews, saveSavedViews, type SavedView } from "@/modules/crm/savedViews";
import type { Lead } from "@/domain/types";

function lead(id: string, overrides: Partial<Lead> = {}): Lead {
  return {
    id,
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    name: `ליד ${id}`,
    phone: "050-0000000",
    email: `${id}@x.co`,
    source: "אתר",
    interest: "קורס",
    status: "חדש",
    ownerId: "u-1",
    followUp: "2026-07-25",
    notes: "",
    history: [],
    ...overrides,
  };
}

describe("filterLeads", () => {
  const leads = [
    lead("a", { status: "חדש", ownerId: "u-1", source: "אתר" }),
    lead("b", { status: "במשא ומתן", ownerId: "u-2", source: "המלצה" }),
    lead("c", { status: "חדש", ownerId: "u-2", source: "אתר", name: "אבי כהן" }),
  ];

  it("empty filters return everything", () => {
    expect(filterLeads(leads, EMPTY_FILTERS)).toHaveLength(3);
  });

  it("filters by status + owner + source", () => {
    expect(filterLeads(leads, { ...EMPTY_FILTERS, status: "חדש" })).toHaveLength(2);
    expect(filterLeads(leads, { ...EMPTY_FILTERS, ownerId: "u-2" })).toHaveLength(2);
    expect(filterLeads(leads, { ...EMPTY_FILTERS, source: "המלצה" })).toHaveLength(1);
  });

  it("free-text matches name/phone/email/interest/notes", () => {
    expect(filterLeads(leads, { ...EMPTY_FILTERS, text: "אבי" })).toHaveLength(1);
    expect(filterLeads(leads, { ...EMPTY_FILTERS, text: "לא-קיים" })).toHaveLength(0);
  });
});

describe("conversionRate — decided cohort only", () => {
  it("null when nothing decided (never invented)", () => {
    expect(conversionRate([lead("a")])).toBeNull();
  });
  it("won / (won+lost)", () => {
    expect(
      conversionRate([
        lead("a", { status: "נסגר כלקוח" }),
        lead("b", { status: "לא רלוונטי" }),
        lead("c", { status: "חדש" }),
      ]),
    ).toBe(50);
  });
});

describe("newThisWeek", () => {
  it("counts leads created in the trailing 7 days", () => {
    const leads = [
      lead("a", { createdAt: "2026-07-22T08:00:00.000Z" }),
      lead("b", { createdAt: "2026-07-16T08:00:00.000Z" }),
      lead("c", { createdAt: "2026-07-10T08:00:00.000Z" }),
    ];
    expect(newThisWeek(leads, "2026-07-22")).toBe(2);
  });
});

describe("hottestLeads + agingAlerts", () => {
  it("ranks advanced stages first", () => {
    const hot = hottestLeads([
      lead("a", { status: "קיבל פרטים" }),
      lead("b", { status: "במשא ומתן" }),
      lead("c", { status: "חדש" }),
    ]);
    expect(hot.map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("aging: only open leads past follow-up, most overdue first", () => {
    const alerts = agingAlerts(
      [
        lead("a", { followUp: "2026-07-20" }),
        lead("b", { followUp: "2026-07-10" }),
        lead("c", { followUp: "2026-07-10", status: "נסגר כלקוח" }),
        lead("d", { followUp: "2026-07-23" }),
      ],
      "2026-07-22",
    );
    expect(alerts.map((a) => a.lead.id)).toEqual(["b", "a"]);
    expect(alerts[0]?.daysOverdue).toBe(12);
  });
});

describe("leadSources", () => {
  it("distinct sorted sources", () => {
    expect(
      leadSources([lead("a", { source: "טלפון" }), lead("b"), lead("c", { source: "אתר" })]),
    ).toEqual(["אתר", "טלפון"]);
  });
});

describe("savedViews — localStorage round-trip", () => {
  it("save and load preserve views; corrupt data yields []", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    const view: SavedView = {
      id: "v1",
      name: "החמים שלי",
      filters: { ...EMPTY_FILTERS, status: "במשא ומתן" },
      sorting: [{ id: "followUp", desc: false }],
    };
    saveSavedViews([view], storage);
    const loaded = loadSavedViews(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.filters.status).toBe("במשא ומתן");

    mem.set("teragon-w3.crm.savedViews", "not json{{");
    expect(loadSavedViews(storage)).toEqual([]);
  });
});
