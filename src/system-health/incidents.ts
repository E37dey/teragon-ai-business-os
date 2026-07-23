// W8-D — open a health incident into the governanceIncidents collection.
// The governance module (separate workstream) owns rendering/lifecycle of
// incidents; W8-D only WRITES a validated record and links to /governance
// (integration note in docs/integration-requests-w8d.md).
import {
  healthIncidentSchema,
  type HealthIncident,
  type SystemComponentHealth,
} from "@/domain/system-health";
import type { BaseEntity } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import type { Repository } from "@/repositories/Repository";
import { nextId } from "@/repositories/Repository";

export interface IncidentStores {
  collection<T extends BaseEntity = BaseEntity>(key: CollectionKey): Repository<T>;
}

/** States that justify opening an incident (never from a green state). */
export function incidentJustified(component: SystemComponentHealth): boolean {
  return component.state === "דורש תשומת לב" || component.state === "לא זמין";
}

export async function openHealthIncident(
  stores: IncidentStores,
  component: SystemComponentHealth,
  openedBy: string,
  now: () => string = () => new Date().toISOString(),
): Promise<HealthIncident> {
  if (!incidentJustified(component)) {
    throw new Error(
      `אין לפתוח אירוע ממצב «${component.state}» — אירועים נפתחים רק ממצב הדורש טיפול`,
    );
  }
  const repo = stores.collection<HealthIncident>("governanceIncidents");
  const existing = await repo.list();
  // duplicate guard: one OPEN incident per component
  const open = existing.find(
    (i) => i.source === "system-health" && i.componentId === component.componentId && i.status === "פתוח",
  );
  if (open) return open;
  const ts = now();
  const incident: HealthIncident = {
    id: nextId(
      "ghi",
      existing.map((i) => i.id),
    ),
    createdAt: ts,
    updatedAt: ts,
    componentId: component.componentId,
    titleHe: `בריאות המערכת: ${component.nameHe} במצב «${component.state}»`,
    descriptionHe: `${component.detailHe}${component.limitationHe ? ` · מגבלה: ${component.limitationHe}` : ""} · שיטת בדיקה: ${component.checkMethodHe}`,
    stateAtOpen: component.state,
    openedBy,
    status: "פתוח",
    source: "system-health",
  };
  healthIncidentSchema.parse(incident);
  return repo.create(incident);
}
