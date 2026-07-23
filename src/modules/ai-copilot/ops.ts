// W5-D module-local Copilot operations — RELOCATED (W6-E, Phase 6.16) to
// src/integration/localOps.ts as pure functions with a registration manifest.
// This file stays as the module's import surface so nothing else changes;
// the Integration Lead moves the implementations into LocalRulesProvider
// (see docs/integration-requests-w6e.md).
export {
  courseFitScanOp,
  quotationsNoResponseOp,
  recurringFaultsOp,
  stuckStudentsOp,
  unansweredCustomersOp,
  type LocalOpDeps,
} from "@/integration/localOps";
