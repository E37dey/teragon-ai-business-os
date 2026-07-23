// W6 WIRING — Command-Center memory band items (Phase 6.20).
// Pure mapping from the derived commandCenterMemoryBand to clickable rows.
// Zero-value rows are HIDDEN (no decorative zeros); every remaining row
// carries a real route into /memory, /knowledge or /learning.
import type { CommandCenterMemoryBand } from "@/integration/commandCenterMemory";

export interface MemoryBandItem {
  id: string;
  labelHe: string;
  value: number;
  route: string;
}

/** count rows for the band — zero values filtered out (honest, not decorative) */
export function memoryBandItems(band: CommandCenterMemoryBand): MemoryBandItem[] {
  const all: MemoryBandItem[] = [
    {
      id: "approved",
      labelHe: "פריטי זיכרון מאושרים",
      value: band.approvedCount,
      route: "/memory",
    },
    {
      id: "links",
      labelHe: "קישורי ידע (wikilinks)",
      value: band.linkCount,
      route: "/memory?view=graph",
    },
    {
      id: "updated-today",
      labelHe: "עודכנו היום",
      value: band.updatedToday,
      route: "/memory?filter=today",
    },
    {
      id: "pending-proposals",
      labelHe: "הצעות זיכרון ממתינות",
      value: band.pendingProposals,
      route: "/memory?filter=pending",
    },
    {
      id: "contradictions",
      labelHe: "סתירות ללא הכרעה",
      value: band.unresolvedContradictions,
      route: "/knowledge?filter=conflicts",
    },
    {
      id: "reviews-due",
      labelHe: "סקירות ידע שהגיע זמנן",
      value: band.reviewsDue,
      route: "/knowledge?filter=reviews",
    },
    {
      id: "learning-pending",
      labelHe: "הצעות למידה ממתינות",
      value: band.learningProposalsWaiting,
      route: "/learning?filter=pending",
    },
  ];
  return all.filter((item) => item.value > 0);
}
