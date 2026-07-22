// TERAGON AI BUSINESS OS — Netlify Function wrapper (Wave 5, W5-B).
// Thin wrapper only: ALL logic lives in src/server/handlers.ts (unit-tested).
// Netlify Functions v2 signature: default export (Request) => Response.
import { defaultAiHandlers } from "../../src/server/handlers";

export default (req: Request): Promise<Response> => defaultAiHandlers.aiSummarize(req);
