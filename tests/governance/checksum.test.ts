// W8-B — sha-256 correctness (FIPS 180-4 vectors) + prompt/policy checksum
// stability + the protected-text contract (checksum only, never the text).
import { describe, expect, it } from "vitest";
import { AGENT_DEFINITIONS, AGENT_IDS } from "@/agents/definitions";
import {
  derivePromptRegistry,
  policyContentChecksum,
  promptFingerprintSource,
  sha256Hex,
} from "@/governance";

describe("sha256Hex — FIPS 180-4 test vectors", () => {
  it('hashes "" correctly', () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it('hashes "abc" correctly', () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashes the two-block message correctly", () => {
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("handles Hebrew (multi-byte UTF-8) deterministically", () => {
    const a = sha256Hex("מדיניות שימוש נכון ב-AI");
    const b = sha256Hex("מדיניות שימוש נכון ב-AI");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(sha256Hex("מדיניות שימוש נכון ב-AI!"));
  });
});

describe("prompt registry checksums", () => {
  it("is stable: same frozen definition ⇒ same checksum on every derivation", () => {
    const now = "2026-07-23T08:00:00.000Z";
    const first = derivePromptRegistry(now);
    const second = derivePromptRegistry(now);
    expect(first.map((r) => r.checksumSha256)).toEqual(second.map((r) => r.checksumSha256));
  });

  it("covers all 7 governed agents + the system-policy layer", () => {
    const records = derivePromptRegistry("2026-07-23T08:00:00.000Z");
    expect(records).toHaveLength(AGENT_IDS.length + 1);
    for (const id of AGENT_IDS) {
      const rec = records.find((r) => r.agentId === id);
      expect(rec, id).toBeTruthy();
      expect(rec?.version).toBe(AGENT_DEFINITIONS[id]?.promptVersion);
    }
  });

  it("NEVER stores the protected fingerprint text — checksum only", () => {
    const records = derivePromptRegistry("2026-07-23T08:00:00.000Z");
    for (const rec of records) {
      expect(rec.protectedTextStored).toBe(false);
      const serialized = JSON.stringify(rec);
      // the composed protected source never appears in the record
      if (rec.agentId) {
        const def = AGENT_DEFINITIONS[rec.agentId];
        expect(def).toBeTruthy();
        if (def) {
          expect(serialized).not.toContain(promptFingerprintSource(def));
          expect(serialized).not.toContain(def.purposeHe);
        }
      }
      expect(rec.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("different agents get different checksums (no shared placeholder)", () => {
    const records = derivePromptRegistry("2026-07-23T08:00:00.000Z");
    const sums = new Set(records.map((r) => r.checksumSha256));
    expect(sums.size).toBe(records.length);
  });
});

describe("policy content checksum", () => {
  const sections = [{ headingHe: "עקרון", bulletsHe: ["שורה אחת"] }];

  it("is stable for identical content and sensitive to any change", () => {
    const a = policyContentChecksum("gp-x", 1, "כותרת", sections);
    expect(a).toBe(policyContentChecksum("gp-x", 1, "כותרת", sections));
    expect(a).not.toBe(policyContentChecksum("gp-x", 2, "כותרת", sections));
    expect(a).not.toBe(policyContentChecksum("gp-x", 1, "כותרת אחרת", sections));
    expect(a).not.toBe(
      policyContentChecksum("gp-x", 1, "כותרת", [
        { headingHe: "עקרון", bulletsHe: ["שורה אחרת"] },
      ]),
    );
  });
});
