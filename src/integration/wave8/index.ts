// W8-E — cross-module integration barrel (Wave 8).
// NOTE: intentionally NOT re-exported from src/integration/index.ts (that file
// is shared/lead-owned) — consumers import "@/integration/wave8/<module>".
export * from "./automationExecutionGuard";
export * from "./healthIncidents";
export * from "./applyUiSettings";
export * from "./managementBand";
