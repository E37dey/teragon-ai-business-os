// W5-E security gap-fill — auth boundary (Phase 5.15 "unauthorized organization").
// Existing coverage (tests/ai/server/handlers.test.ts "auth boundary") checks a
// malformed demo HEADER and a well-formed one. The GAPS filled here:
//   - malformed identity CLAIMS (organizationId / userId / sessionId shape)
//   - header/log-injection shaped claims (CRLF, spaces) are rejected
//   - overlong claims are rejected
//   - a demo context is NEVER trusted (trusted:false), regardless of shape
// The demo verifier validates SHAPE only — that limitation is documented in
// src/server/auth.ts and restated honestly in docs/WAVE_5_SECURITY_REPORT.md.
import { describe, expect, it } from "vitest";
import { demoAuthVerifier } from "@/server/auth";
import { ServerAIError } from "@/server/errors";
import { aiErrorResponseDtoV1Schema } from "@/ai/contracts/serverDto";
import { createAiHandlers } from "@/server/handlers";
import { CaptureSink, makeDto, postRequest, TEST_ENV } from "../server/helpers";

function handlers(envOverrides: Record<string, string | undefined> = {}) {
  return createAiHandlers({
    env: () => ({ ...TEST_ENV, ...envOverrides }),
    logSink: new CaptureSink(),
  });
}

const VALID = { organizationId: "org-teragon", userId: "user-1", sessionId: "session-1" };

describe("demoAuthVerifier — claim shape validation (unit)", () => {
  it("accepts well-formed claims but NEVER marks them trusted", () => {
    const ctx = demoAuthVerifier.verify({ ...VALID, authHeader: null });
    expect(ctx.trusted).toBe(false);
    expect(ctx.mode).toBe("demo");
    expect(ctx.organizationId).toBe("org-teragon");
  });

  const badClaims: [string, Record<string, string>][] = [
    ["empty organizationId", { ...VALID, organizationId: "" }],
    ["organizationId with spaces", { ...VALID, organizationId: "org teragon" }],
    ["CRLF log-injection in organizationId", { ...VALID, organizationId: "org\r\nx-fake: 1" }],
    ["newline in userId", { ...VALID, userId: "user\n1" }],
    ["HTML/script chars in userId", { ...VALID, userId: "<script>u</script>" }],
    ["overlong sessionId (129 chars)", { ...VALID, sessionId: "s".repeat(129) }],
    ["Hebrew letters in sessionId (outside claim alphabet)", { ...VALID, sessionId: "מזהה-1" }],
  ];
  for (const [label, claims] of badClaims) {
    it(`rejects ${label} with AI_PERMISSION_DENIED`, () => {
      expect(() =>
        demoAuthVerifier.verify({
          organizationId: claims["organizationId"] as string,
          userId: claims["userId"] as string,
          sessionId: claims["sessionId"] as string,
          authHeader: null,
        }),
      ).toThrowError(ServerAIError);
      try {
        demoAuthVerifier.verify({
          organizationId: claims["organizationId"] as string,
          userId: claims["userId"] as string,
          sessionId: claims["sessionId"] as string,
          authHeader: null,
        });
      } catch (err) {
        expect((err as ServerAIError).code).toBe("AI_PERMISSION_DENIED");
      }
    });
  }
});

describe("handler-level: malformed organization claim ⇒ 403, adapter never reached", () => {
  it("CRLF-shaped organizationId in the DTO is refused with AI_PERMISSION_DENIED", async () => {
    const res = await handlers().aiSummarize(
      postRequest("ai-summarize", makeDto({ organizationId: "org\r\nInjected: yes" })),
    );
    expect(res.status).toBe(403);
    const body = aiErrorResponseDtoV1Schema.parse(await res.json());
    expect(body.error.code).toBe("AI_PERMISSION_DENIED");
    // the raw malformed claim is never echoed back
    expect(JSON.stringify(body)).not.toContain("Injected");
  });

  it("overlong userId claim is refused before any provider work", async () => {
    const res = await handlers().aiRecommend(
      postRequest("ai-recommend", makeDto({ userId: "u".repeat(129) })),
    );
    expect(res.status).toBe(403);
  });

  it("the error audit for a refused claim does not contain the malformed value", async () => {
    const audits: unknown[] = [];
    const h = createAiHandlers({
      env: () => TEST_ENV,
      logSink: new CaptureSink(),
      onAudit: (e) => audits.push(e),
    });
    await h.aiSummarize(
      postRequest("ai-summarize", makeDto({ organizationId: "org evil\r\nheader" })),
    );
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits)).not.toContain("evil");
  });
});
