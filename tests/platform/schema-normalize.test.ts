// Gate S7.1.2 — strict normalization of live introspection results. Models the
// REAL CLI/API shapes (numeric strings, PG array literals, JSON arrays) and
// proves a PARSE failure is never reported as SCHEMA_DRIFT.
import { describe, expect, it } from "vitest";
import {
  parseIntegerField,
  parseBooleanField,
  parseStringField,
  parseNullableStringField,
  parseStringArrayField,
  parsePgArrayLiteral,
  normalizeSchemaRow,
  IntrospectionParseError,
} from "../../scripts/platform/shared/schema-normalize.mjs";
import { compareSchema } from "../../scripts/platform/schema-verify.mjs";
import { GOOD_SCHEMA_ROW } from "./fakes";

const FUNCS = [
  "auth_org_id",
  "auth_role_id",
  "bootstrap_admin",
  "close_service_ticket",
  "current_profile",
  "has_capability",
  "is_active",
  "is_org_member",
  "is_service_role",
];

describe("scalar field parsers", () => {
  it("parseIntegerField accepts number + integer string; rejects fractional/malformed", () => {
    expect(parseIntegerField(47, "x")).toBe(47);
    expect(parseIntegerField("47", "x")).toBe(47);
    expect(() => parseIntegerField(47.5, "x")).toThrow(IntrospectionParseError);
    expect(() => parseIntegerField("47.0", "x")).toThrow(/integer string/);
    expect(() => parseIntegerField("abc", "x")).toThrow(IntrospectionParseError);
    expect(() => parseIntegerField(null, "x")).toThrow(/unexpected representation/);
  });

  it("parseBooleanField accepts bool + 'true'/'false'; rejects otherwise", () => {
    expect(parseBooleanField(true, "b")).toBe(true);
    expect(parseBooleanField("false", "b")).toBe(false);
    expect(parseBooleanField("t", "b")).toBe(true);
    expect(() => parseBooleanField("yes", "b")).toThrow(/not a boolean/);
    expect(() => parseBooleanField(1, "b")).toThrow(/not a boolean/);
  });

  it("parseStringField / parseNullableStringField", () => {
    expect(parseStringField("a", "s")).toBe("a");
    expect(() => parseStringField(3, "s")).toThrow(/not a string/);
    expect(parseNullableStringField(null, "s")).toBeNull();
    expect(parseNullableStringField("x", "s")).toBe("x");
  });
});

describe("PG array-literal compat parser", () => {
  it("handles {} and {a,b}", () => {
    expect(parsePgArrayLiteral("{}", "f")).toEqual([]);
    expect(parsePgArrayLiteral("{a,b,c}", "f")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted entries, commas-in-quotes, escaped quotes/backslashes", () => {
    expect(parsePgArrayLiteral('{"a b","c,d"}', "f")).toEqual(["a b", "c,d"]);
    expect(parsePgArrayLiteral('{"quote\\"in","back\\\\slash"}', "f")).toEqual(['quote"in', "back\\slash"]);
  });

  it("distinguishes unquoted NULL (null) from quoted \"NULL\" (text)", () => {
    expect(parsePgArrayLiteral('{NULL,"NULL"}', "f")).toEqual([null, "NULL"]);
  });

  it("fails closed on a malformed literal", () => {
    expect(() => parsePgArrayLiteral("not-an-array", "f")).toThrow(/not a PG array literal/);
    expect(() => parsePgArrayLiteral('{"unterminated}', "f")).toThrow(/unterminated quote/);
  });
});

describe("parseStringArrayField accepts the three live shapes", () => {
  it("(A) native JS array", () => {
    expect(parseStringArrayField(["x", "y"], "f")).toEqual(["x", "y"]);
  });
  it("(B) JSON array string", () => {
    expect(parseStringArrayField('["x","y"]', "f")).toEqual(["x", "y"]);
  });
  it("(C) PG array-literal string (compat)", () => {
    expect(parseStringArrayField("{x,y}", "f")).toEqual(["x", "y"]);
    expect(parseStringArrayField("{}", "f")).toEqual([]);
  });
  it("rejects null / non-string elements + unknown shapes", () => {
    expect(() => parseStringArrayField("{NULL}", "f")).toThrow(/non-string/);
    expect(() => parseStringArrayField(42, "f")).toThrow(/unexpected representation/);
    expect(() => parseStringArrayField("garbage", "f")).toThrow(/unrecognized array representation/);
  });
});

// --- live-shape fixtures A–E for the whole row ------------------------------
function rowNativeJson() {
  return {
    public_tables: 47, namespaces: 3, migrations: 14, indexes: 200, fk_constraints: 96,
    check_constraints: 468, rls_policies: 185, storage_buckets: 2,
    functions_present: FUNCS, rls_disabled_tables: [], nullable_orgid_tenant_tables: [],
  };
}
function rowCliStrings() {
  // counts as numeric strings; arrays as PG literals — the raw CLI shape.
  return {
    public_tables: "47", namespaces: "3", migrations: "14", indexes: "200", fk_constraints: "96",
    check_constraints: "468", rls_policies: "185", storage_buckets: "2",
    functions_present: `{${FUNCS.join(",")}}`, rls_disabled_tables: "{}", nullable_orgid_tenant_tables: "{}",
  };
}

describe("normalizeSchemaRow across live shapes", () => {
  it("(A) native JSON row normalizes + compareSchema PASS", () => {
    const norm = normalizeSchemaRow(rowNativeJson());
    expect(compareSchema(norm).ok).toBe(true);
  });

  it("(B) CLI string row (numeric strings + PG-literal arrays) normalizes + PASS", () => {
    const norm = normalizeSchemaRow(rowCliStrings());
    expect(norm.publicTables).toBe(47);
    expect(norm.functionsPresent).toEqual(FUNCS);
    expect(compareSchema(norm).ok).toBe(true);
  });

  it("(C) empty arrays as [] / '{}' both yield []", () => {
    expect(normalizeSchemaRow({ ...rowNativeJson(), rls_disabled_tables: [], nullable_orgid_tenant_tables: "{}" }).rlsDisabledTables).toEqual([]);
  });

  it("(D) escaped/ quoted array entries normalize", () => {
    // a hypothetical quoted table name with a comma survives parsing.
    const norm = normalizeSchemaRow({ ...rowCliStrings(), rls_disabled_tables: '{"weird,name"}' });
    expect(norm.rlsDisabledTables).toEqual(["weird,name"]);
  });

  it("REGRESSION-LOCK: the observed live row (the fakeDb GOOD_SCHEMA_ROW) → compareSchema PASS", () => {
    const norm = normalizeSchemaRow(GOOD_SCHEMA_ROW);
    const r = compareSchema(norm);
    expect(r.ok).toBe(true);
    expect(r.totals.publicTables).toBe(47);
    expect(r.totals.bootstrapAdminPresent).toBe(true);
    expect(r.totals.requiredFunctionsPresent).toBe("9/9");
    expect(r.totals.rlsDisabledCount).toBe(0);
    expect(r.totals.nullableOrgIdCount).toBe(0);
  });
});

describe("(E) parse failures fail CLOSED and are NOT schema drift", () => {
  it("malformed numeric string", () => {
    expect(() => normalizeSchemaRow({ ...rowCliStrings(), public_tables: "47x" })).toThrow(IntrospectionParseError);
  });
  it("fractional integer", () => {
    expect(() => normalizeSchemaRow({ ...rowNativeJson(), indexes: 200.5 })).toThrow(IntrospectionParseError);
  });
  it("malformed array literal", () => {
    expect(() => normalizeSchemaRow({ ...rowCliStrings(), functions_present: "{a,,}garbage" })).toThrow(IntrospectionParseError);
  });
  it("unknown object shape for an array field", () => {
    expect(() => normalizeSchemaRow({ ...rowNativeJson(), functions_present: { a: 1 } })).toThrow(IntrospectionParseError);
  });
  it("missing required field", () => {
    const r = rowNativeJson() as Record<string, unknown>;
    delete r.migrations;
    expect(() => normalizeSchemaRow(r)).toThrow(/required field absent/);
  });
  it("unexpected duplicate function entry", () => {
    expect(() => normalizeSchemaRow({ ...rowNativeJson(), functions_present: [...FUNCS, "bootstrap_admin"] })).toThrow(/duplicate/);
  });
  it("the parse error carries INTROSPECTION_PARSE_FAILURE, never 'missing functions'", () => {
    try {
      normalizeSchemaRow({ ...rowCliStrings(), functions_present: "not-an-array-or-literal" });
      expect.unreachable();
    } catch (e) {
      expect((e as { category?: string }).category).toBe("INTROSPECTION_PARSE_FAILURE");
      expect(String(e)).not.toMatch(/missing functions/);
    }
  });
});
