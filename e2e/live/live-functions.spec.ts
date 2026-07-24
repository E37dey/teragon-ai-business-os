// W9-F Phase 10.2 §2 — Netlify Functions over the LIVE deploy.
// Contract (docs/AI_ARCHITECTURE.md + docs/AI_SERVER_SECURITY.md): the demo is
// Mode A — AI_REMOTE_ENABLED is false, so the deployed functions must ANSWER
// (not 404 / not crash) and must answer HONESTLY: never "מחובר", never a
// fabricated capability list, and never a stack trace on a bad request.
import { test, expect, type APIResponse } from "@playwright/test";
import { LIVE_URL } from "../live.config";

const FN = `${LIVE_URL}/.netlify/functions`;

/** anything that looks like a JS stack frame / internal path leak */
const STACK_PATTERNS = [
  /\n\s*at\s+\S+/,
  /\.(ts|js|mjs|cjs):\d+:\d+/,
  /node:internal/,
  /\/var\/task\//,
  /ERR_MODULE_NOT_FOUND/,
];

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /AKIA[A-Z0-9]{12,}/,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/,
  /[Bb]earer\s+[A-Za-z0-9._~+/=-]{16,}/,
  /ANTHROPIC_API_KEY|OPENAI_API_KEY|AI_API_KEY/,
];

async function json(res: APIResponse): Promise<Record<string, unknown>> {
  const text = await res.text();
  for (const re of STACK_PATTERNS) expect(text, `stack/internal leak: ${text}`).not.toMatch(re);
  for (const re of SECRET_PATTERNS) expect(text, "secret leak").not.toMatch(re);
  return JSON.parse(text) as Record<string, unknown>;
}

test("live fn ai-health — answers, state is מושבת/לא הוגדר and NEVER מחובר", async ({
  request,
}) => {
  const res = await request.get(`${FN}/ai-health`);
  expect(res.status(), "ai-health must be deployed and reachable").toBe(200);
  const body = await json(res);
  const health = body.health as { state?: string; detail?: string; checkedAt?: string };
  expect(body.dtoVersion).toBe("v1");
  expect(["מושבת", "לא הוגדר"], `honest state, got: ${health?.state}`).toContain(health?.state);
  expect(health?.state).not.toBe("מחובר");
  // no model may be advertised while the remote provider is off
  expect(body.model ?? null).toBeNull();
  expect(health?.detail, "Hebrew operator detail").toBeTruthy();
  expect(String(health?.detail)).toMatch(/[֐-׿]/);
});

test("live fn ai-capabilities — no remote operations advertised in Mode A", async ({ request }) => {
  const res = await request.get(`${FN}/ai-capabilities`);
  expect(res.status()).toBe(200);
  const body = await json(res);
  expect(body.dtoVersion).toBe("v1");
  const caps = body.capabilities as {
    operations?: unknown[];
    streaming?: boolean;
    structuredOutput?: boolean;
    detail?: string;
  };
  expect(caps?.operations, "no fabricated remote operations").toEqual([]);
  expect(caps?.streaming).toBe(false);
  expect(caps?.structuredOutput).toBe(false);
  expect(String(caps?.detail)).toMatch(/[֐-׿]/);
});

test("live fn ai-config — remoteEnabled === false", async ({ request }) => {
  const res = await request.get(`${FN}/ai-config`);
  expect(res.status()).toBe(200);
  const body = await json(res);
  expect(body.remoteEnabled, "remote MUST be disabled on the demo deploy").toBe(false);
  expect(["מושבת", "לא הוגדר"]).toContain(body.providerState);
});

test("live fn ai-summarize — POST garbage returns a structured Hebrew error, no stack trace", async ({
  request,
}) => {
  const res = await request.post(`${FN}/ai-summarize`, {
    headers: { "Content-Type": "application/json" },
    data: "not-json-at-all{{{",
  });
  // must be a client/handled error — never a 500 with a raw crash body
  expect(res.status(), "handled error status").toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
  const body = await json(res);
  expect(body.dtoVersion).toBe("v1");
  const err = body.error as {
    code?: string;
    messageHe?: string;
    correlationId?: string;
    recoverable?: boolean;
  };
  expect(err?.code, "machine-readable error code").toBeTruthy();
  expect(String(err?.messageHe), "Hebrew operator message").toMatch(/[֐-׿]/);
  expect(err?.correlationId, "traceable correlation id").toBeTruthy();
  expect(typeof err?.recoverable).toBe("boolean");
});

test("live fn ai-summarize — a WELL-FORMED request still refuses honestly in Mode A", async ({
  request,
}) => {
  const res = await request.post(`${FN}/ai-summarize`, {
    headers: { "Content-Type": "application/json" },
    data: { text: "סיכום בדיקה של פריסה חיה", locale: "he" },
  });
  const body = await json(res);
  // Whatever the shape, it must NEVER claim a remote summary was produced.
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/"state"\s*:\s*"מחובר"/);
  expect(res.status()).toBeLessThan(500);
});

test("live functions carry the hardened response headers + no-store", async ({ request }) => {
  const res = await request.get(`${FN}/ai-health`);
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["cache-control"]).toContain("no-store");
  expect(h["content-type"]).toContain("application/json");
});
