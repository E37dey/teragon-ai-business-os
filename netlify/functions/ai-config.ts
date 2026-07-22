// TERAGON AI BUSINESS OS — Netlify Function wrapper (Wave 5, W5-B).
// Public runtime config: {remoteEnabled, providerState} — NO secrets, ever.
// Thin wrapper only: ALL logic lives in src/server/handlers.ts (unit-tested).
import { defaultAiHandlers } from "../../src/server/handlers";

export default (req: Request): Promise<Response> => defaultAiHandlers.aiConfig(req);
