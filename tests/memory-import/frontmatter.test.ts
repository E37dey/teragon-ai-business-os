// W6-B — frontmatter contract: 14 supported fields, unknown-preserve,
// denylist validator, size cap, YAML-alias guard.
import { describe, expect, it } from "vitest";
import {
  FRONTMATTER_MAX_BYTES,
  FrontmatterError,
  SUPPORTED_FRONTMATTER_FIELDS,
  isDenylistedFrontmatterKey,
  parseFrontmatter,
  splitFrontmatter,
} from "@/memory/markdown/frontmatter";

describe("splitFrontmatter", () => {
  it("splits fence-delimited frontmatter from the body", () => {
    const { frontmatterRaw, body } = splitFrontmatter("---\ntitle: א\n---\nגוף");
    expect(frontmatterRaw).toBe("title: א");
    expect(body).toBe("גוף");
  });

  it("returns null frontmatter when the document has none", () => {
    expect(splitFrontmatter("# רק גוף").frontmatterRaw).toBeNull();
  });

  it("treats an unterminated fence as body (fail open to text, not YAML)", () => {
    const r = splitFrontmatter("---\ntitle: x\nno close");
    expect(r.frontmatterRaw).toBeNull();
    expect(r.body).toContain("title: x");
  });
});

describe("parseFrontmatter — 14 supported fields", () => {
  it("parses every supported field (scalar, inline list, block list)", () => {
    const yaml = [
      "id: note-1",
      'title: "פגישת לקוח"',
      "aliases: [פגישה, לקוח א]",
      "tags:",
      "  - זיכרון",
      "  - לקוחות",
      "memory_layer: customer",
      "folder: לקוחות VIP",
      "owner: צחי זוסטייהם",
      "sensitivity: פנימי",
      "status: מאומת",
      "created: 2026-07-01",
      "updated: 2026-07-20",
      "review_date: 2026-12-01",
      "linked_entities: [customers:cust-1]",
      "sources: [ticket:t-8]",
    ].join("\n");
    const parsed = parseFrontmatter(yaml);
    expect(parsed.fields.id).toBe("note-1");
    expect(parsed.fields.title).toBe("פגישת לקוח");
    expect(parsed.fields.aliases).toEqual(["פגישה", "לקוח א"]);
    expect(parsed.fields.tags).toEqual(["זיכרון", "לקוחות"]);
    expect(parsed.fields.memory_layer).toBe("customer");
    expect(parsed.fields.folder).toBe("לקוחות VIP");
    expect(parsed.fields.owner).toBe("צחי זוסטייהם");
    expect(parsed.fields.sensitivity).toBe("פנימי");
    expect(parsed.fields.status).toBe("מאומת");
    expect(parsed.fields.created).toBe("2026-07-01");
    expect(parsed.fields.updated).toBe("2026-07-20");
    expect(parsed.fields.review_date).toBe("2026-12-01");
    expect(parsed.fields.linked_entities).toEqual(["customers:cust-1"]);
    expect(parsed.fields.sources).toEqual(["ticket:t-8"]);
    expect(Object.keys(parsed.extensions)).toHaveLength(0);
    expect(SUPPORTED_FRONTMATTER_FIELDS).toHaveLength(14);
  });

  it("preserves unknown fields in extensions — never in fields", () => {
    const parsed = parseFrontmatter("title: א\ncolor: red\ncustom_list: [x, y]");
    expect(parsed.fields.title).toBe("א");
    expect(parsed.extensions.color).toBe("red");
    expect(parsed.extensions.custom_list).toEqual(["x", "y"]);
    expect((parsed.fields as Record<string, unknown>).color).toBeUndefined();
  });

  it("preserves unknown NESTED content as raw text in extensions", () => {
    const parsed = parseFrontmatter("meta:\n  inner: 1\n  deep: 2");
    expect(typeof parsed.extensions.meta).toBe("string");
    expect(parsed.extensions.meta).toContain("inner: 1");
  });

  it("rejects a nested map under a SUPPORTED field", () => {
    expect(() => parseFrontmatter("tags:\n  nested: x")).toThrowError(FrontmatterError);
    try {
      parseFrontmatter("tags:\n  nested: x");
    } catch (e) {
      expect((e as FrontmatterError).code).toBe("FRONTMATTER_INVALID");
    }
  });
});

describe("parseFrontmatter — denylist (fail closed)", () => {
  const forbidden = [
    "permissions",
    "role",
    "system_prompt",
    "system-prompt",
    "prompt",
    "approved_by",
    "auto_approve",
    "bypass_review",
    "credentials",
    "password",
    "api_key",
    "apikey",
    "secret_token",
    "token",
    "private_key",
    "auth",
    "tool_access",
    "tools",
    "mcp_servers",
    "org_id",
    "organization_identity",
    "tenant_id",
    "exec",
    "eval",
    "script",
    "shell",
    "on_open",
  ];

  for (const key of forbidden) {
    it(`rejects "${key}"`, () => {
      expect(isDenylistedFrontmatterKey(key)).toBe(true);
      try {
        parseFrontmatter(`${key}: value`);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(FrontmatterError);
        expect((e as FrontmatterError).code).toBe("FRONTMATTER_DENYLIST");
        expect((e as FrontmatterError).message).toMatch(/[֐-׿]/u); // Hebrew
      }
    });
  }

  it("never denylists the 14 supported fields", () => {
    for (const field of SUPPORTED_FRONTMATTER_FIELDS) {
      expect(isDenylistedFrontmatterKey(field)).toBe(false);
    }
  });
});

describe("parseFrontmatter — guards", () => {
  it("rejects frontmatter over 16KB", () => {
    const big = `note: ${"א".repeat(FRONTMATTER_MAX_BYTES)}`;
    try {
      parseFrontmatter(big);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as FrontmatterError).code).toBe("FRONTMATTER_TOO_LARGE");
    }
  });

  it("rejects YAML anchors, aliases and merge keys (recursive-alias guard)", () => {
    for (const evil of ["a: &anchor [1]", "b: *anchor", "<<: *base"]) {
      try {
        parseFrontmatter(evil);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as FrontmatterError).code).toBe("FRONTMATTER_YAML_ALIAS");
      }
    }
  });
});
