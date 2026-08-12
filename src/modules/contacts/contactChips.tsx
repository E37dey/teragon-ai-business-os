// S9.3-C — shared contact presentation helpers, so the standalone /contacts list
// and the customer-detail contacts section render primary status identically.
import type { ReactElement } from "react";
import { StatusChip } from "@/design-system";

export function primaryChip(isPrimary: boolean): ReactElement {
  return isPrimary ? (
    <StatusChip status="פעיל" label="ראשי" />
  ) : (
    <StatusChip status="מושבת" label="משני" />
  );
}
