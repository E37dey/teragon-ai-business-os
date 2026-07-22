// Printers module — pure derivations: warranty windows, maintenance-due logic,
// ticket↔printer linkage and deterministic course matching. Unit-tested.
import type {
  Course,
  CustomerPrinter,
  ISODate,
  PrinterModel,
  RepairAction,
  ServiceTicket,
} from "@/domain/types";

export const RULES_ENGINE_LABEL = "מנוע מקומי מבוסס כללים";

/** Module policy: 12-month warranty, maintenance every 6 months. */
export const WARRANTY_MONTHS = 12;
export const MAINTENANCE_INTERVAL_DAYS = 180;
export const WARRANTY_WARN_DAYS = 30;

/** add months to a YYYY-MM-DD date (UTC-safe). */
export function addMonths(iso: ISODate, months: number): ISODate {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: ISODate, toIso: ISODate): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** Warranty end derived from purchase date (12 months policy). */
export function warrantyUntil(printer: CustomerPrinter): ISODate {
  return addMonths(printer.purchasedAt, WARRANTY_MONTHS);
}

export type WarrantyState = "בתוקף" | "פג בקרוב" | "פגה";

/** Derived warranty state; the boolean flag wins when it says the warranty is over. */
export function warrantyState(printer: CustomerPrinter, today: ISODate): WarrantyState {
  if (!printer.underWarranty) return "פגה";
  const until = warrantyUntil(printer);
  const left = daysBetween(today, until);
  if (left < 0) return "פגה";
  if (left <= WARRANTY_WARN_DAYS) return "פג בקרוב";
  return "בתוקף";
}

/** Tickets linked to a customer printer: same customer + model name mentioned. */
export function ticketsForPrinter(
  printer: CustomerPrinter,
  model: PrinterModel | undefined,
  tickets: readonly ServiceTicket[],
): ServiceTicket[] {
  if (!model) return [];
  return tickets.filter(
    (t) => t.customerId === printer.customerId && t.printer.includes(model.name),
  );
}

/** The most recent maintenance-like touch: service ticket or repair action date. */
export function lastMaintenanceDate(
  printer: CustomerPrinter,
  model: PrinterModel | undefined,
  tickets: readonly ServiceTicket[],
  actions: readonly RepairAction[],
): ISODate {
  const linked = ticketsForPrinter(printer, model, tickets);
  const dates: ISODate[] = [printer.purchasedAt.slice(0, 10)];
  for (const t of linked) {
    dates.push(t.openedAt.slice(0, 10));
    for (const a of actions) {
      if (a.ticketId === t.id) dates.push(a.performedAt.slice(0, 10));
    }
  }
  return dates.reduce((max, d) => (d > max ? d : max));
}

export interface MaintenanceInfo {
  lastTouch: ISODate;
  nextDue: ISODate;
  /** positive ⇒ overdue by that many days */
  overdueDays: number;
  due: boolean;
}

/** Maintenance due when the last touch is older than the interval (180 days). */
export function maintenanceInfo(
  printer: CustomerPrinter,
  model: PrinterModel | undefined,
  tickets: readonly ServiceTicket[],
  actions: readonly RepairAction[],
  today: ISODate,
): MaintenanceInfo {
  const lastTouch = lastMaintenanceDate(printer, model, tickets, actions);
  const nextDue = addDays(lastTouch, MAINTENANCE_INTERVAL_DAYS);
  const overdueDays = daysBetween(nextDue, today);
  return { lastTouch, nextDue, overdueDays, due: overdueDays >= 0 };
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface FleetHealth {
  total: number;
  underWarranty: number;
  warrantyExpiringSoon: number;
  maintenanceDue: number;
  withOpenTicket: number;
}

const OPEN_TICKET_STATUSES: ReadonlySet<string> = new Set([
  "חדש",
  "בבדיקה",
  "ממתין ללקוח",
  "ממתין לחלק",
]);

export function fleetHealth(
  printers: readonly CustomerPrinter[],
  models: readonly PrinterModel[],
  tickets: readonly ServiceTicket[],
  actions: readonly RepairAction[],
  today: ISODate,
): FleetHealth {
  let underWarrantyN = 0;
  let expiring = 0;
  let due = 0;
  let withOpen = 0;
  for (const p of printers) {
    const model = models.find((m) => m.id === p.printerModelId);
    const w = warrantyState(p, today);
    if (w === "בתוקף") underWarrantyN += 1;
    if (w === "פג בקרוב") expiring += 1;
    if (maintenanceInfo(p, model, tickets, actions, today).due) due += 1;
    if (ticketsForPrinter(p, model, tickets).some((t) => OPEN_TICKET_STATUSES.has(t.status)))
      withOpen += 1;
  }
  return {
    total: printers.length,
    underWarranty: underWarrantyN,
    warrantyExpiringSoon: expiring,
    maintenanceDue: due,
    withOpenTicket: withOpen,
  };
}

/**
 * Deterministic related-courses matcher: keyword rules over model manufacturer
 * and technology. Rules engine — not a model.
 */
export function relatedCourses(
  model: PrinterModel | undefined,
  courses: readonly Course[],
): Course[] {
  if (!model) return [];
  return courses.filter((c) => {
    const hay = `${c.name} ${c.type}`;
    if (hay.includes("פתרון תקלות")) return true;
    if (model.manufacturer === "Bambu Lab" && hay.includes("Bambu")) return true;
    if (hay.includes("מבוא")) return true;
    return false;
  });
}
