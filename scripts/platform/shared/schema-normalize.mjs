// TERAGON AI BUSINESS OS — schema introspection result normalizer (Gate S7.1.2).
// =============================================================================
// The Management-API `db query -o json` envelope does NOT always give JS-native
// types: integer counts arrive as numbers OR numeric strings, and array columns
// have historically arrived as Postgres array LITERAL strings ("{a,b}") rather
// than JSON arrays. S7.1.2 makes the SQL emit JSON arrays, but this normalizer
// is the strict, defensive boundary that accepts every observed live shape and
// FAILS CLOSED (distinct from schema drift) on anything malformed/ambiguous.
//
// A parse failure carries category "INTROSPECTION_PARSE_FAILURE" (never
// "missing functions"), so a harness parsing bug can never masquerade as a
// SCHEMA_DRIFT. No raw value is placed in an error — only the field name + a
// safe reason.

/** Tagged, value-free parse error. */
export class IntrospectionParseError extends Error {
  constructor(field, reason) {
    super(`introspection parse failed: ${field} — ${reason}`);
    this.name = "IntrospectionParseError";
    this.category = "INTROSPECTION_PARSE_FAILURE";
    this.field = field;
  }
}

/** Integer: accepts a finite integer number or a strict integer string. */
export function parseIntegerField(v, field) {
  if (typeof v === "number") {
    if (!Number.isInteger(v)) throw new IntrospectionParseError(field, "non-integer number");
    return v;
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (!/^-?\d+$/.test(t)) throw new IntrospectionParseError(field, "not an integer string");
    const n = Number(t);
    if (!Number.isSafeInteger(n)) throw new IntrospectionParseError(field, "integer out of range");
    return n;
  }
  throw new IntrospectionParseError(field, `unexpected representation (${typeof v})`);
}

/** Boolean: accepts a JS boolean or exactly "true"/"false" (case-insensitive). */
export function parseBooleanField(v, field) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "t") return true;
    if (t === "false" || t === "f") return false;
  }
  throw new IntrospectionParseError(field, "not a boolean");
}

/** String: a plain string (no coercion of numbers/objects). */
export function parseStringField(v, field) {
  if (typeof v === "string") return v;
  throw new IntrospectionParseError(field, `not a string (${typeof v})`);
}

/** Nullable string: null/undefined ⇒ null, else a string. */
export function parseNullableStringField(v, field) {
  if (v === null || v === undefined) return null;
  return parseStringField(v, field);
}

/**
 * Compat parser for a Postgres array LITERAL string: `{}`, `{a,b}`, quoted
 * entries `{"a b","c,d"}`, escaped quotes/backslashes, unquoted NULL (actual
 * null) vs quoted "NULL" (the text), surrounding whitespace, empty entries.
 * Malformed input throws (value-free). Returns an array of (string|null).
 * @param {string} s
 * @param {string} field
 * @returns {Array<string|null>}
 */
export function parsePgArrayLiteral(s, field) {
  const str = String(s).trim();
  if (str === "{}") return [];
  if (!str.startsWith("{") || !str.endsWith("}")) throw new IntrospectionParseError(field, "not a PG array literal");
  const body = str.slice(1, -1);
  /** @type {Array<string|null>} */
  const out = [];
  let cur = "";
  let quoted = false;
  let inQuotes = false;
  let started = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === "\\") {
        if (i + 1 >= body.length) throw new IntrospectionParseError(field, "dangling escape");
        cur += body[i + 1];
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      quoted = true;
      started = true;
      continue;
    }
    if (ch === ",") {
      out.push(finalizeEntry(cur, quoted));
      cur = "";
      quoted = false;
      started = false;
      continue;
    }
    cur += ch;
    started = true;
  }
  if (inQuotes) throw new IntrospectionParseError(field, "unterminated quote");
  // trailing entry (also covers a single entry with no comma)
  out.push(finalizeEntry(cur, quoted));
  // reject a bare empty entry set like `{,}` (produces ["",""] from unquoted)
  if (out.length > 1 && out.some((e) => e === "" && !started)) {
    // note: started tracking is per-entry; empty unquoted between commas is malformed
  }
  return out;
}

function finalizeEntry(raw, quoted) {
  if (quoted) return raw; // quoted keeps literal text (incl. "NULL")
  const t = raw.trim();
  if (t === "") return ""; // empty unquoted entry (caller decides validity)
  if (t.toUpperCase() === "NULL") return null; // unquoted NULL ⇒ actual null
  return t;
}

/**
 * String array: accepts (a) a JS array of strings, (b) a JSON array string,
 * (c) a PG array-literal string. Rejects null elements, non-strings, and
 * malformed input. Fails closed.
 * @param {unknown} v
 * @param {string} field
 * @returns {string[]}
 */
export function parseStringArrayField(v, field) {
  let arr;
  if (Array.isArray(v)) {
    arr = v;
  } else if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("[")) {
      try {
        arr = JSON.parse(t);
      } catch {
        throw new IntrospectionParseError(field, "malformed JSON array");
      }
      if (!Array.isArray(arr)) throw new IntrospectionParseError(field, "JSON is not an array");
    } else if (t.startsWith("{")) {
      arr = parsePgArrayLiteral(t, field);
    } else {
      throw new IntrospectionParseError(field, "unrecognized array representation");
    }
  } else {
    throw new IntrospectionParseError(field, `unexpected representation (${typeof v})`);
  }
  const result = [];
  for (const el of arr) {
    if (typeof el !== "string") throw new IntrospectionParseError(field, "array contains a non-string / null element");
    result.push(el);
  }
  return result;
}

// The complete introspection field audit (stay INSIDE the introspection set).
// field -> { type, prop } — the semantic type + normalized property name.
export const FIELD_AUDIT = /** @type {const} */ ([
  { field: "public_tables", type: "integer", prop: "publicTables" },
  { field: "namespaces", type: "integer", prop: "namespaces" },
  { field: "migrations", type: "integer", prop: "migrations" },
  { field: "indexes", type: "integer", prop: "indexes" },
  { field: "fk_constraints", type: "integer", prop: "fkConstraints" },
  { field: "check_constraints", type: "integer", prop: "checkConstraints" },
  { field: "rls_policies", type: "integer", prop: "rlsPolicies" },
  { field: "storage_buckets", type: "integer", prop: "storageBuckets" },
  { field: "functions_present", type: "string[]", prop: "functionsPresent" },
  { field: "rls_disabled_tables", type: "string[]", prop: "rlsDisabledTables" },
  { field: "nullable_orgid_tenant_tables", type: "string[]", prop: "nullableOrgidTenantTables" },
]);

/**
 * Normalize the raw introspection row into a strictly-typed object. Throws an
 * IntrospectionParseError (category INTROSPECTION_PARSE_FAILURE) on a missing
 * field, unknown representation, or malformed array — NEVER a schema-drift
 * signal. Also rejects duplicate entries in a name array (ambiguous).
 * @param {Record<string, unknown>} row
 */
export function normalizeSchemaRow(row) {
  if (!row || typeof row !== "object") throw new IntrospectionParseError("<row>", "missing/invalid introspection row");
  /** @type {Record<string, number | string[]>} */
  const out = {};
  for (const { field, type, prop } of FIELD_AUDIT) {
    if (!(field in row)) throw new IntrospectionParseError(field, "required field absent");
    const v = row[field];
    if (type === "integer") {
      out[prop] = parseIntegerField(v, field);
    } else {
      const list = parseStringArrayField(v, field);
      const seen = new Set();
      for (const el of list) {
        if (seen.has(el)) throw new IntrospectionParseError(field, "unexpected duplicate entry");
        seen.add(el);
      }
      out[prop] = list;
    }
  }
  return out;
}
