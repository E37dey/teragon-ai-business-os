// TERAGON AI BUSINESS OS — Netlify Function wrapper (Wave 5, W5-B).
// NDJSON streaming per DTO v1: start / delta* / done(envelope) | error.
// Thin wrapper only: ALL logic lives in src/server/handlers.ts (unit-tested).
import { defaultAiHandlers } from "../../src/server/handlers";

export default (req: Request): Promise<Response> => defaultAiHandlers.aiStream(req);
