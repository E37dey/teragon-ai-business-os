// W5-C public surface — W5-D (UI) consumes the engine through this module.
export * from "./limits";
export * from "./errors";
export * from "./definitions";
export * from "./conflicts";
export * from "./approvalEngine";
export * from "./orchestrator";
export * from "./selectors";
export * from "./demoScenario";
export { appendEvent, writeAudit, type Clock } from "./runlog";
