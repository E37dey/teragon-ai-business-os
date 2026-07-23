// W8-D — the diagnostic export must be REDACTED: injected secrets, key-shaped
// strings and stack-trace lines never survive into the exported JSON.
import { beforeEach, describe, expect, it } from "vitest";
import { __resetRepositoriesForTests } from "@/repositories";
import {
  DIAGNOSTIC_REPORT_VERSION,
  buildDiagnosticReport,
  diagnosticFileName,
  redactDiagnosticText,
} from "@/system-health/diagnostics";
import { buildHealthSnapshot } from "@/system-health/snapshot";
import { makeEnv, T0 } from "./helpers";

beforeEach(() => __resetRepositoriesForTests());

const FAKE_SECRETS = [
  "sk-FAKEsecret1234567890",
  "AKIAFAKEFAKEFAKE1234",
  "api_key = 'super-secret-value-123'",
  "Bearer abcdefghijklmnopqrstuvwx",
  "password: hunter2secret",
];

describe("redactDiagnosticText", () => {
  it("removes every injected secret shape", () => {
    for (const secret of FAKE_SECRETS) {
      const { text, redactionCount } = redactDiagnosticText(`לפני ${secret} אחרי`);
      expect(redactionCount).toBeGreaterThan(0);
      expect(text).not.toContain(secret.slice(-10));
    }
  });

  it("removes stack-trace lines", () => {
    const { text } = redactDiagnosticText("שגיאה\n    at doWork (src/x.ts:12:34)\nסוף");
    expect(text).not.toContain("at doWork");
  });
});

describe("buildDiagnosticReport — end to end", () => {
  it("injected secrets inside a check detail are absent from the exported JSON", async () => {
    const env = await makeEnv();
    const snapshot = await buildHealthSnapshot(env, []);
    const first = snapshot.components[0];
    if (!first) throw new Error("snapshot ריק");
    first.detailHe = `ממצא עם סוד: sk-FAKEinjected99999999 וגם api_key = "leaked-value-42"`;
    const { report, json } = buildDiagnosticReport(snapshot, "בודק", () => T0);
    expect(json).not.toContain("sk-FAKEinjected99999999");
    expect(json).not.toContain("leaked-value-42");
    expect(report.redactionCount).toBeGreaterThan(0);
    expect(report.reportVersion).toBe(DIAGNOSTIC_REPORT_VERSION);
  });

  it("report declares its honest exclusions (no env values, no keys, no stack traces)", async () => {
    const env = await makeEnv();
    const snapshot = await buildHealthSnapshot(env, []);
    const { report } = buildDiagnosticReport(snapshot, "בודק", () => T0);
    expect(report.exclusionsHe.join(" ")).toContain("משתני סביבה");
    expect(report.exclusionsHe.join(" ")).toContain("stack traces");
  });

  it("file name is deterministic from the clock", () => {
    expect(diagnosticFileName(() => T0)).toBe("teragon-diagnostics-2026-07-23-09-00-00.json");
  });
});
