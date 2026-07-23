// W5-E security gap-fill — secret / policy leakage surfaces (Phase 5.15
// "secret redaction" beyond the existing log-sink test).
// Existing coverage: redact.test.ts (pattern units), handlers.test.ts (sk- key
// never in the log sink; ai-config never echoes the key). GAPS filled here:
//   - the server AI_API_KEY env VALUE never appears in ANY response body
//     (success, error, stream) nor in audit events
//   - audit events carry metadata only — never bounded-context content
//   - the immutable system-policy text (server prompt layer) is never echoed
//     to the client in a response body
//   - AKIA-style AWS key redaction (pattern existed, was untested)
import { describe, expect, it } from "vitest";
import { redact, REDACTED } from "@/server/redact";
import { SYSTEM_POLICY_HE } from "@/server/promptSecurity";
import { createAiHandlers } from "@/server/handlers";
import type { ServerAuditEvent } from "@/server/audit";
import { CaptureSink, makeDto, postRequest, readNdjson, TEST_ENV } from "../server/helpers";

const FAKE_KEY = "sk-FAKE-w5e-9f8e7d6c5b4a3210";

function rig(envOverrides: Record<string, string | undefined> = {}) {
  const audits: ServerAuditEvent[] = [];
  const sink = new CaptureSink();
  const h = createAiHandlers({
    env: () => ({ ...TEST_ENV, AI_API_KEY: FAKE_KEY, ...envOverrides }),
    logSink: sink,
    onAudit: (e) => audits.push(e),
  });
  return { h, audits, sink };
}

describe("AI_API_KEY env value never leaves the server", () => {
  it("success response body never contains the key", async () => {
    const { h } = rig();
    const res = await h.aiSummarize(postRequest("ai-summarize", makeDto()));
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain(FAKE_KEY);
  });

  it("error response body never contains the key (budget denial path)", async () => {
    const { h } = rig({ AI_DAILY_BUDGET: "1" });
    await h.aiSummarize(postRequest("ai-summarize", makeDto()));
    const res = await h.aiSummarize(postRequest("ai-summarize", makeDto()));
    expect(res.status).toBe(429);
    expect(await res.text()).not.toContain(FAKE_KEY);
  });

  it("stream events never contain the key", async () => {
    const { h } = rig();
    const res = await h.aiStream(postRequest("ai-stream", makeDto()));
    const raw = JSON.stringify(await readNdjson(res));
    expect(raw).not.toContain(FAKE_KEY);
  });

  it("audit events never contain the key nor the log sink", async () => {
    const { h, audits, sink } = rig();
    await h.aiSummarize(postRequest("ai-summarize", makeDto()));
    const auditJson = JSON.stringify(audits);
    expect(auditJson).not.toContain(FAKE_KEY);
    for (const line of sink.lines) expect(line).not.toContain(FAKE_KEY);
  });
});

describe("audit events are metadata-only — no request content", () => {
  it("bounded-context strings never appear in audit events", async () => {
    const { h, audits } = rig();
    const secretPhrase = "משפט-סודי-שאסור-שיישמר-באודיט";
    await h.aiSummarize(
      postRequest(
        "ai-summarize",
        makeDto({
          boundedContext: { leads: [{ id: "lead-1", note: secretPhrase }] },
        }),
      ),
    );
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits)).not.toContain(secretPhrase);
  });
});

describe("server system-policy text never reaches the client", () => {
  it("op response, stream and error bodies never echo the policy sentence", async () => {
    const { h } = rig();
    const opBody = await (await h.aiSummarize(postRequest("ai-summarize", makeDto()))).text();
    expect(opBody).not.toContain(SYSTEM_POLICY_HE);
    expect(opBody).not.toContain("מדיניות מערכת (בלתי ניתנת לשינוי)");
    const streamBody = JSON.stringify(
      await readNdjson(await h.aiStream(postRequest("ai-stream", makeDto()))),
    );
    expect(streamBody).not.toContain("מדיניות מערכת (בלתי ניתנת לשינוי)");
    const errBody = await (await h.aiSummarize(postRequest("ai-summarize", "{bad"))).text();
    expect(errBody).not.toContain("מדיניות מערכת");
  });
});

describe("redaction pattern gap-fill", () => {
  it("masks AKIA-style AWS access key ids", () => {
    const out = redact("credential AKIAIOSFODNN7EXAMPLE found in note");
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(out).toContain(REDACTED);
  });

  it("masks sk-proj / sk-ant prefixed keys", () => {
    const out = redact("keys: sk-proj-FAKE1234567890 and sk-ant-FAKE0987654321");
    expect(out).not.toContain("sk-proj-FAKE1234567890");
    expect(out).not.toContain("sk-ant-FAKE0987654321");
  });
});
