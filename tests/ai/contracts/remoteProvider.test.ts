// RemoteAIProvider against a mocked fetch — valid, malformed, abort,
// auth-failed, health passthrough, NDJSON streaming. NO real network.
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CORRELATION_ID_HEADER } from "@/ai/contracts/serverDto";
import { RemoteAIProvider } from "@/ai/providers/RemoteAIProvider";
import type { AIStreamEvent } from "@/ai/contracts/AIProvider";
import { makeRequest, sampleEnvelope } from "./fixtures";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function provider(fetchImpl: typeof fetch): RemoteAIProvider {
  let n = 0;
  return new RemoteAIProvider({
    fetchImpl,
    correlationIdFactory: () => `corr-test-${++n}`,
  });
}

describe("envelope calls", () => {
  it("valid server envelope passes zod and is returned as-is", async () => {
    const envelope = sampleEnvelope();
    const fetchMock = vi.fn(async () => jsonResponse({ dtoVersion: "v1", envelope }));
    const p = provider(fetchMock as unknown as typeof fetch);
    const result = await p.summarize(makeRequest("summarize.weekly-leads"));
    expect(result).toEqual(envelope);
    // relative endpoint + correlation header + no secrets anywhere
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("/.netlify/functions/ai-summarize");
    const headers = call[1].headers as Record<string, string>;
    expect(headers[CORRELATION_ID_HEADER]).toBeTruthy();
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.dtoVersion).toBe("v1");
    expect(body.operation).toBe("summarize.weekly-leads");
    expect("model" in body).toBe(false); // the client NEVER sends a model name
  });

  it("malformed server body ⇒ structured recoverable AI_RESPONSE_INVALID", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ totally: "wrong" }));
    const p = provider(fetchMock as unknown as typeof fetch);
    await expect(p.classify(makeRequest("classify.lead-intent"))).rejects.toMatchObject({
      code: "AI_RESPONSE_INVALID",
      recoverable: true,
    });
  });

  it("HTTP 401 with a DTO error body maps to the server's stable code", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          dtoVersion: "v1",
          error: {
            code: "AI_PROVIDER_AUTH_FAILED",
            messageHe: "אימות נכשל",
            correlationId: "corr-s-1",
            recoverable: false,
          },
        },
        401,
      ),
    );
    const p = provider(fetchMock as unknown as typeof fetch);
    await expect(p.recommend(makeRequest("recommend.follow-up"))).rejects.toMatchObject({
      code: "AI_PROVIDER_AUTH_FAILED",
      correlationId: "corr-s-1",
    });
  });

  it("HTTP 429 without a DTO body falls back to status mapping (recoverable)", async () => {
    const fetchMock = vi.fn(async () => new Response("too many", { status: 429 }));
    const p = provider(fetchMock as unknown as typeof fetch);
    await expect(p.explain(makeRequest("explain.recommendation"))).rejects.toMatchObject({
      code: "AI_RATE_LIMITED",
      recoverable: true,
    });
  });

  it("network failure ⇒ AI_PROVIDER_UNAVAILABLE (recoverable)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const p = provider(fetchMock as unknown as typeof fetch);
    await expect(p.summarize(makeRequest("summarize.meetings"))).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
      recoverable: true,
    });
  });

  it("abort ⇒ AI_REQUEST_CANCELLED", async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException("The user aborted a request.", "AbortError");
    });
    const p = provider(fetchMock as unknown as typeof fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(
      p.summarize(makeRequest("summarize.weekly-leads", { signal: controller.signal })),
    ).rejects.toMatchObject({ code: "AI_REQUEST_CANCELLED" });
  });
});

describe("health — the client never claims connected on its own", () => {
  it("passes a verified server health through", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        dtoVersion: "v1",
        health: { state: "מחובר", checkedAt: "2026-07-23T10:00:00.000Z", detail: "אומת בשרת" },
        model: "server-model",
      }),
    );
    const p = provider(fetchMock as unknown as typeof fetch);
    const health = await p.health();
    expect(health.state).toBe("מחובר");
    expect(health.detail).toBe("אומת בשרת");
  });

  it('unreachable server ⇒ "לא זמין" — NOT connected', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const p = provider(fetchMock as unknown as typeof fetch);
    const health = await p.health();
    expect(health.state).toBe("לא זמין");
  });

  it('malformed health body ⇒ "לא זמין" — never a fabricated "מחובר"', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ state: "מחובר" })); // wrong shape
    const p = provider(fetchMock as unknown as typeof fetch);
    const health = await p.health();
    expect(health.state).toBe("לא זמין");
  });

  it('HTTP 401 on health ⇒ "שגיאת אימות"', async () => {
    const fetchMock = vi.fn(async () => new Response("no", { status: 401 }));
    const p = provider(fetchMock as unknown as typeof fetch);
    const health = await p.health();
    expect(health.state).toBe("שגיאת אימות");
  });
});

describe("generateStructured", () => {
  it("validates the value against the caller schema", async () => {
    const envelope = sampleEnvelope({ operation: "recommend.printer-match" });
    const fetchMock = vi.fn(async () =>
      jsonResponse({ dtoVersion: "v1", envelope, value: { top: "Prusa Mini" } }),
    );
    const p = provider(fetchMock as unknown as typeof fetch);
    const { value } = await p.generateStructured(
      makeRequest("recommend.printer-match"),
      z.object({ top: z.string() }),
    );
    expect(value.top).toBe("Prusa Mini");
  });

  it("value not matching the caller schema ⇒ AI_RESPONSE_INVALID", async () => {
    const envelope = sampleEnvelope();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ dtoVersion: "v1", envelope, value: { wrong: 1 } }),
    );
    const p = provider(fetchMock as unknown as typeof fetch);
    await expect(
      p.generateStructured(makeRequest("recommend.printer-match"), z.object({ top: z.string() })),
    ).rejects.toMatchObject({ code: "AI_RESPONSE_INVALID" });
  });
});

describe("streaming (NDJSON over ReadableStream)", () => {
  function ndjsonResponse(lines: unknown[]): Response {
    const text = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
    return new Response(text, { status: 200, headers: { "content-type": "application/x-ndjson" } });
  }

  it("parses start/delta/done events and validates each line", async () => {
    const envelope = sampleEnvelope();
    const fetchMock = vi.fn(async () =>
      ndjsonResponse([
        {
          type: "start",
          dtoVersion: "v1",
          requestId: "req-1",
          correlationId: "corr-1",
          provider: "remote",
        },
        { type: "delta", text: "שלום " },
        { type: "delta", text: "עולם" },
        { type: "done", envelope },
      ]),
    );
    const p = provider(fetchMock as unknown as typeof fetch);
    const events: AIStreamEvent[] = [];
    for await (const ev of p.stream(makeRequest("summarize.weekly-leads"))) events.push(ev);
    expect(events.map((e) => e.type)).toEqual(["start", "delta", "delta", "done"]);
    const done = events[3];
    if (done?.type === "done") expect(done.envelope).toEqual(envelope);
  });

  it("a malformed stream line becomes a structured error event and stops the stream", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          '{"type":"start","dtoVersion":"v1","requestId":"r","correlationId":"c","provider":"remote"}\nnot-json\n',
          {
            status: 200,
          },
        ),
    );
    const p = provider(fetchMock as unknown as typeof fetch);
    const events: AIStreamEvent[] = [];
    for await (const ev of p.stream(makeRequest("summarize.weekly-leads"))) events.push(ev);
    expect(events[0]?.type).toBe("start");
    expect(events[1]).toMatchObject({ type: "error", code: "AI_RESPONSE_INVALID" });
    expect(events).toHaveLength(2);
  });

  it("server error event is surfaced as-is (stable code, Hebrew message)", async () => {
    const fetchMock = vi.fn(async () =>
      ndjsonResponse([
        {
          type: "error",
          code: "AI_DAILY_BUDGET_EXCEEDED",
          messageHe: "תקציב מוצה",
          recoverable: false,
        },
      ]),
    );
    const p = provider(fetchMock as unknown as typeof fetch);
    const events: AIStreamEvent[] = [];
    for await (const ev of p.stream(makeRequest("summarize.weekly-leads"))) events.push(ev);
    expect(events[0]).toMatchObject({ type: "error", code: "AI_DAILY_BUDGET_EXCEEDED" });
  });
});
