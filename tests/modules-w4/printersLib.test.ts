// Wave 4 — printers module: warranty windows, maintenance-due derivation, fleet health.
import { describe, expect, it } from "vitest";
import type { CustomerPrinter, PrinterModel, ServiceTicket } from "@/domain/types";
import {
  addDays,
  addMonths,
  fleetHealth,
  lastMaintenanceDate,
  maintenanceInfo,
  relatedCourses,
  ticketsForPrinter,
  warrantyState,
  warrantyUntil,
} from "@/modules/printers/lib";

const MODEL: PrinterModel = {
  id: "pm-x",
  name: "Bambu Lab A1",
  manufacturer: "Bambu Lab",
  technology: "FDM",
  price: 1990,
  tags: [],
  note: "",
  createdAt: "2026-01-01T08:00:00.000Z",
  updatedAt: "2026-01-01T08:00:00.000Z",
};

function printer(patch: Partial<CustomerPrinter>): CustomerPrinter {
  return {
    id: "cp-x",
    customerId: "cu-1",
    printerModelId: "pm-x",
    serialNumber: "SN-1",
    purchasedAt: "2026-01-01",
    underWarranty: true,
    notes: "",
    createdAt: "2026-01-01T08:00:00.000Z",
    updatedAt: "2026-01-01T08:00:00.000Z",
    ...patch,
  };
}

function ticket(patch: Partial<ServiceTicket>): ServiceTicket {
  return {
    id: "t-x",
    customerName: "לקוח",
    customerId: "cu-1",
    printer: "Bambu Lab A1",
    issue: "כיול",
    description: "",
    priority: "נמוכה",
    status: "נסגר",
    openedAt: "2026-06-01",
    ownerId: "u-ran",
    solution: "",
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-01T08:00:00.000Z",
    ...patch,
  };
}

describe("date helpers", () => {
  it("addMonths / addDays are UTC-stable", () => {
    expect(addMonths("2026-01-31", 12)).toBe("2027-01-31");
    expect(addMonths("2026-01-01", 6)).toBe("2026-07-01");
    expect(addDays("2026-01-01", 180)).toBe("2026-06-30");
  });
});

describe("warranty derivation (12-month policy)", () => {
  it("warrantyUntil = purchase + 12 months", () => {
    expect(warrantyUntil(printer({ purchasedAt: "2026-01-15" }))).toBe("2027-01-15");
  });
  it("state: in force / expiring soon (≤30d) / expired", () => {
    expect(warrantyState(printer({ purchasedAt: "2026-05-01" }), "2026-07-22")).toBe("בתוקף");
    expect(warrantyState(printer({ purchasedAt: "2025-08-01" }), "2026-07-22")).toBe("פג בקרוב");
    expect(warrantyState(printer({ purchasedAt: "2025-01-01" }), "2026-07-22")).toBe("פגה");
  });
  it("the explicit underWarranty=false flag wins", () => {
    expect(warrantyState(printer({ underWarranty: false }), "2026-07-22")).toBe("פגה");
  });
});

describe("ticket ↔ printer linkage", () => {
  it("matches same customer + model name in the free-text printer field", () => {
    const p = printer({});
    const list = [
      ticket({ id: "a" }),
      ticket({ id: "b", customerId: "cu-2" }), // other customer
      ticket({ id: "c", printer: "Prusa MK4" }), // other model
    ];
    expect(ticketsForPrinter(p, MODEL, list).map((t) => t.id)).toEqual(["a"]);
  });
});

describe("maintenance-due derivation (180-day interval)", () => {
  it("uses purchase date when there was no service touch", () => {
    const p = printer({ purchasedAt: "2026-01-01" });
    expect(lastMaintenanceDate(p, MODEL, [], [])).toBe("2026-01-01");
    const m = maintenanceInfo(p, MODEL, [], [], "2026-07-22");
    expect(m.nextDue).toBe("2026-06-30");
    expect(m.due).toBe(true);
    expect(m.overdueDays).toBe(22);
  });
  it("a recent linked ticket resets the clock", () => {
    const p = printer({ purchasedAt: "2026-01-01" });
    const m = maintenanceInfo(p, MODEL, [ticket({ openedAt: "2026-06-01" })], [], "2026-07-22");
    expect(m.lastTouch).toBe("2026-06-01");
    expect(m.due).toBe(false);
  });
});

describe("fleetHealth", () => {
  it("counts warranty / maintenance / open-ticket states", () => {
    const printers = [
      printer({ id: "1", purchasedAt: "2026-05-01" }), // in warranty; open ticket resets maintenance
      printer({ id: "2", customerId: "cu-2", purchasedAt: "2025-06-01", underWarranty: false }), // expired + maintenance due
    ];
    const openTicket = ticket({ id: "o", status: "בבדיקה", openedAt: "2026-07-20" });
    const h = fleetHealth(printers, [MODEL], [openTicket], [], "2026-07-22");
    expect(h.total).toBe(2);
    expect(h.underWarranty).toBe(1);
    expect(h.maintenanceDue).toBe(1);
    expect(h.withOpenTicket).toBe(1); // the ticket links to cu-1's unit only
  });
});

describe("relatedCourses — deterministic rules", () => {
  const course = (name: string) => ({
    id: `c-${name}`,
    name,
    type: name,
    start: "2026-07-01",
    end: "2026-08-01",
    price: 0,
    status: "פעיל" as const,
    zoom: "",
    instructorId: "u",
    isAI: false,
    blurb: "",
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-01T08:00:00.000Z",
  });
  it("matches troubleshooting always, Bambu course for Bambu models", () => {
    const list = [
      course("פתרון תקלות במדפסות"),
      course("Bambu Studio מהיסוד"),
      course("SolidWorks"),
    ];
    const names = relatedCourses(MODEL, list).map((c) => c.name);
    expect(names).toContain("פתרון תקלות במדפסות");
    expect(names).toContain("Bambu Studio מהיסוד");
    expect(names).not.toContain("SolidWorks");
  });
  it("empty for missing model", () => {
    expect(relatedCourses(undefined, [course("מבוא")])).toEqual([]);
  });
});
