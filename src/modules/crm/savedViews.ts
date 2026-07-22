// Wave 3 — CRM saved views, persisted to localStorage (module-scoped key).
import type { LeadFilters } from "./selectors";

export interface SavedSort {
  id: string;
  desc: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  filters: LeadFilters;
  sorting: SavedSort[];
}

export const CRM_VIEWS_KEY = "teragon-w3.crm.savedViews";

export function loadSavedViews(storage: Pick<Storage, "getItem"> = localStorage): SavedView[] {
  try {
    const raw = storage.getItem(CRM_VIEWS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as SavedView).id === "string" &&
        typeof (v as SavedView).name === "string" &&
        typeof (v as SavedView).filters === "object",
    );
  } catch {
    return [];
  }
}

export function saveSavedViews(
  views: readonly SavedView[],
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(CRM_VIEWS_KEY, JSON.stringify(views));
  } catch {
    // storage full/unavailable — views are a convenience, never fatal
  }
}
