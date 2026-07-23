// W5-D — AI Copilot barrel (PAGE_CONTRACT).
export { default as CopilotWorkspace } from "./CopilotWorkspace";
export { CopilotProvider } from "./copilotContext";
export { useCopilot, type CopilotApi } from "./copilotApi";
export {
  COPILOT_COMMANDS,
  W6_MEMORY_COMMANDS,
  ALL_COPILOT_COMMANDS,
  matchCommand,
  normalizeCommandText,
  UNSUPPORTED_COMMAND_HE,
  EMPTY_CHIPS,
  type CopilotCommand,
  type CommandOutcome,
  type CopilotContextChips,
} from "./commands";
export {
  unansweredCustomersOp,
  quotationsNoResponseOp,
  stuckStudentsOp,
  recurringFaultsOp,
  courseFitScanOp,
} from "./ops";
