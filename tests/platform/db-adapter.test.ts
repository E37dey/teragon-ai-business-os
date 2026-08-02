// Gate S7.1.1 — db adapter executes SQL from a temp file (never inline argv),
// proving the Windows cmd.exe mangling that broke schema-verify cannot recur.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createDbAdapter, parseQueryRowsStrict } from "../../scripts/platform/shared/adapters/db.mjs";

// A Windows-hostile fixture: multiple lines, single + double quotes, parens,
// semicolons, JSON operators, quoted aliases, tabs/whitespace/line breaks.
const HOSTILE_SQL = [
  "select",
  "  (select count(*) from pg_tables where schemaname='public') as \"public tables\",",
  "  jsonb_build_object('k', 'v')->>'k' as j,",
  "  (1+2)*3 as math;   -- trailing comment with parens ( ) and ; semicolons",
  "\tselect 'quoted ''inner'' value';",
].join("\n");

const OK_ENVELOPE = JSON.stringify({ boundary: "x", rows: [{ n: 1 }], warning: "untrusted" });

/** A capture spy that records argv and can read the temp file mid-execution. */
function spy(behavior: (tempPath: string) => string | Promise<string>) {
  const calls: { command: string; args: string[]; tempPath: string; fileContentAtCall: string | null }[] = [];
  const capture = async (command: string, args: string[]) => {
    const i = args.indexOf("-f");
    const tempPath = i > -1 ? args[i + 1]! : "";
    const fileContentAtCall = tempPath && existsSync(tempPath) ? readFileSync(tempPath, "utf8") : null;
    calls.push({ command, args, tempPath, fileContentAtCall });
    return behavior(tempPath);
  };
  return { calls, capture };
}

describe("db.query — temp-file execution contract", () => {
  it("passes -f + ONE temp path; the SQL body is never an argv element", async () => {
    const { calls, capture } = spy(() => OK_ENVELOPE);
    const db = createDbAdapter({ capture });
    await db.query(HOSTILE_SQL);
    const { args } = calls[0]!;
    expect(args).toContain("-f");
    // no argv element contains the SQL body, a newline, or the hostile tokens
    for (const a of args) {
      expect(a).not.toContain(HOSTILE_SQL);
      expect(a).not.toContain("\n");
      expect(a).not.toMatch(/select .*count/i);
    }
    // exactly one -f temp path
    expect(args.filter((a) => a === "-f")).toHaveLength(1);
  });

  it("the temp file holds the EXACT SQL during execution", async () => {
    const { calls, capture } = spy(() => OK_ENVELOPE);
    const db = createDbAdapter({ capture });
    await db.query(HOSTILE_SQL);
    expect(calls[0]!.fileContentAtCall).toBe(HOSTILE_SQL);
  });

  it("removes the temp file + dir AFTER success", async () => {
    let captured = "";
    const { capture } = spy((p) => {
      captured = p;
      return OK_ENVELOPE;
    });
    const db = createDbAdapter({ capture });
    await db.query(HOSTILE_SQL);
    expect(captured).not.toBe("");
    expect(existsSync(captured)).toBe(false);
  });

  it("removes the temp file + dir AFTER a CLI failure", async () => {
    let captured = "";
    const { capture } = spy((p) => {
      captured = p;
      const e = new Error("cli-exit-nonzero") as Error & { exitCode: number; stderr: string };
      e.exitCode = 1;
      e.stderr = "boom";
      throw e;
    });
    const db = createDbAdapter({ capture });
    await expect(db.query(HOSTILE_SQL)).rejects.toThrow(/non-zero exit/);
    expect(existsSync(captured)).toBe(false);
  });

  it("fails CLOSED on a non-zero exit (no SQL/stderr in the message)", async () => {
    const { capture } = spy(() => {
      const e = new Error("cli-exit-nonzero") as Error & { stderr: string };
      e.stderr = "ERROR: table customers something SENSITIVE";
      throw e;
    });
    const db = createDbAdapter({ capture });
    let thrown: unknown;
    try {
      await db.query(HOSTILE_SQL);
    } catch (e) {
      thrown = e;
    }
    expect(String(thrown)).not.toContain("SENSITIVE");
    expect(String(thrown)).not.toContain(HOSTILE_SQL);
    expect(String(thrown)).toMatch(/schema-query failed/);
  });

  it("fails CLOSED on a malformed result", async () => {
    const db = createDbAdapter({ capture: async () => "not json at all" });
    await expect(db.query("select 1")).rejects.toThrow(/malformed/);
    const db2 = createDbAdapter({ capture: async () => JSON.stringify({ boundary: "x" }) }); // no rows[]
    await expect(db2.query("select 1")).rejects.toThrow(/malformed/);
  });

  it("returns the parsed rows on success", async () => {
    const db = createDbAdapter({ capture: async () => OK_ENVELOPE });
    const rows = await db.query("select 1");
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("two concurrent calls use DIFFERENT temp paths", async () => {
    const seen: string[] = [];
    const capture = async (_c: string, args: string[]) => {
      const p = args[args.indexOf("-f") + 1]!;
      seen.push(p);
      await new Promise((r) => setTimeout(r, 15));
      return OK_ENVELOPE;
    };
    const db = createDbAdapter({ capture });
    await Promise.all([db.query("select 1"), db.query("select 2")]);
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });
});

describe("db.runScriptFile — still green, safe assertion reasons", () => {
  it("passes the script path via -f and returns ok on success", async () => {
    const { calls, capture } = spy(() => OK_ENVELOPE);
    const db = createDbAdapter({ capture });
    const r = await db.runScriptFile("supabase/tests/01_anonymous_denial.sql");
    expect(r.ok).toBe(true);
    expect(calls[0]!.args).toContain("-f");
    expect(calls[0]!.args).toContain("supabase/tests/01_anonymous_denial.sql");
  });

  it("returns a sanitized assertion label on failure (no raw stderr)", async () => {
    const capture = async () => {
      const e = new Error("cli-exit-nonzero") as Error & { stderr: string };
      e.stderr = 'unexpected status 400: {"message":"Failed to run sql query: ERROR: P0001: FAIL: cross-org read leaked\\nCONTEXT: ..."}';
      throw e;
    };
    const db = createDbAdapter({ capture });
    const r = await db.runScriptFile("supabase/tests/02_cross_org_read_denial.sql");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/FAIL: cross-org read leaked/);
    expect(r.error).not.toMatch(/CONTEXT|status 400|message/);
  });
});

describe("parseQueryRowsStrict", () => {
  it("tolerates a leading non-JSON banner then the envelope", () => {
    expect(parseQueryRowsStrict('Initialising login role...\n' + OK_ENVELOPE)).toEqual([{ n: 1 }]);
  });
});
