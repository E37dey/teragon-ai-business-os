// TERAGON AI BUSINESS OS — remote DB query adapter (Gate S7.1 / fix S7.1.1).
// =============================================================================
// Executes SQL against the LINKED staging project via the Supabase CLI
// Management-API SQL endpoint, which runs as the privileged `postgres` role —
// enabling schema introspection AND the RLS assertion scripts (role-switching +
// transactions + rolled-back temp data).
//
// S7.1.1 FIX: the introspection query() used to pass a large MULTI-LINE SQL
// string as an inline argv element. Under Windows cmd.exe (shell:true) that got
// mangled/hung ("sql execution failed"). SQL now NEVER travels the command line:
// it is written to a unique OS-temp `.sql` file and executed via `-f <file>`
// with `shell:false` and SEPARATE argv elements, then the temp file + dir are
// removed in a `finally` (after success AND failure).
//
// Security: SQL body, temp-file contents, DB URL/password, keys, and raw
// stdout/stderr NEVER enter logs or thrown errors. A query failure surfaces only
// a safe op name + category. Read-capable + assertion-script-capable; it does no
// DDL (migrations are applied by the migrate stage). Injectable for tests.
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import process from "node:process";

const QUERY_ARGS = ["db", "query", "--linked", "--agent", "yes", "-o", "json"];

/**
 * Default exec: SEPARATE argv, shell:false (supabase resolves as a real binary),
 * stdout captured privately. Rejects with a value-free error carrying the exit
 * code + stderr on a side channel (never in the message) for safe sanitizing.
 */
function defaultCapture(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { shell: false, windowsHide: true, timeout: 180000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!err) return resolve(String(stdout));
        const e = new Error("cli-exit-nonzero");
        e.exitCode = typeof err.code === "number" ? err.code : 1;
        e.stderr = String(stderr || "");
        reject(e);
      },
    );
  });
}

/** Extract a short, safe reason from a Postgres/CLI error (assertion labels). */
export function sanitizeCliError(text) {
  const fail = /FAIL:[^"\\\n]{0,160}/.exec(String(text ?? ""));
  if (fail) return fail[0].trim();
  const err = /ERROR:\s*[A-Z0-9]{0,6}:?\s*[^"\\\n]{0,120}/.exec(String(text ?? ""));
  if (err) return err[0].trim();
  return "assertion failed";
}

/** Parse the JSON envelope from `db query -o json`; fail CLOSED if malformed. */
export function parseQueryRowsStrict(stdout) {
  const start = typeof stdout === "string" ? stdout.indexOf("{") : -1;
  if (start === -1) throw new Error("malformed query result");
  let parsed;
  try {
    parsed = JSON.parse(stdout.slice(start));
  } catch {
    throw new Error("malformed query result");
  }
  if (!parsed || !Array.isArray(parsed.rows)) throw new Error("malformed query result");
  return parsed.rows;
}

/**
 * @param {Object} [deps]
 * @param {(command:string,args:string[])=>Promise<string>} [deps.capture]
 */
export function createDbAdapter(deps = {}) {
  const run = deps.capture ?? defaultCapture;

  /** Write SQL to a unique temp file OUTSIDE the repo and exec via `-f`. */
  async function execViaTempFile(sql) {
    const dir = mkdtempSync(join(tmpdir(), "teragon-sql-"));
    const file = join(dir, `q-${randomUUID()}.sql`);
    try {
      writeFileSync(file, sql, { encoding: "utf8", mode: 0o600 });
      return await run("supabase", [...QUERY_ARGS, "-f", file]);
    } finally {
      // Cleanup after success AND failure — never leave a temp SQL file behind.
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  }

  return {
    /** Run a read-only introspection query; return rows. Fails CLOSED. */
    async query(sql) {
      let stdout;
      try {
        stdout = await execViaTempFile(sql);
      } catch {
        // Safe failure: op + category only — no SQL, URL, password, keys, or
        // raw stdout/stderr in the message.
        throw new Error("schema-query failed (non-zero exit)");
      }
      return parseQueryRowsStrict(stdout);
    },
    /**
     * Execute a .sql assertion script against the linked DB. The script
     * self-manages a transaction and ROLLBACKs; a RAISE EXCEPTION surfaces as a
     * non-zero exit → { ok:false, error:<safe assertion label> }.
     */
    async runScriptFile(path) {
      try {
        await run("supabase", [...QUERY_ARGS, "-f", path]);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: sanitizeCliError(err?.stderr ?? (err instanceof Error ? err.message : "")) };
      }
    },
  };
}
