// W5-B server test helpers — constructed Request objects + injected env.
// NO real secrets anywhere: keys in tests are obviously-fake placeholders.
import type { AiRequestDtoV1 } from "@/ai/contracts/serverDto";
import type { ServerLogSink } from "@/server/redact";

export const BASE = "https://teragon.example";

/** env preset: deterministic TestAdapter, remote enabled */
export const TEST_ENV: Record<string, string | undefined> = {
  AI_PROVIDER: "test",
  AI_MODEL: "test-model-v9",
  AI_REMOTE_ENABLED: "true",
};

export function makeDto(overrides: Partial<AiRequestDtoV1> = {}): AiRequestDtoV1 {
  return {
    dtoVersion: "v1",
    operation: "summarize.weekly-leads",
    organizationId: "org-teragon",
    userId: "user-1",
    sessionId: "session-1",
    correlationId: "corr-test-1",
    relatedEntities: [{ type: "lead", id: "lead-1" }],
    boundedContext: {
      leads: [{ id: "lead-1", name: "לקוח לדוגמה", note: "מתעניין במדפסת תלת-ממד" }],
    },
    outputSchemaVersion: "v1",
    ...overrides,
  };
}

export function postRequest(
  endpoint: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${BASE}/.netlify/functions/${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": "corr-test-1",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function getRequest(endpoint: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}/.netlify/functions/${endpoint}`, { method: "GET", headers });
}

/** capturing log sink for redaction assertions */
export class CaptureSink implements ServerLogSink {
  readonly lines: string[] = [];
  write(line: string): void {
    this.lines.push(line);
  }
}

export async function readNdjson(res: Response): Promise<unknown[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as unknown);
}
