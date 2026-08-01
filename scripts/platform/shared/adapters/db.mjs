// TERAGON AI BUSINESS OS — remote DB query adapter (Gate S7.1).
// =============================================================================
// Executes SQL against the LINKED staging project via the Supabase CLI
// Management-API SQL endpoint (`supabase db query --linked`), which runs as the
// privileged `postgres` role — enabling schema introspection AND the RLS
// assertion scripts (role-switching + transactions + rolled-back temp data).
//
// Read-capable + assertion-script-capable, but it NEVER performs DDL here (the
// migrations are applied by the migrate stage via `db push`). Values from a
// query row are returned to the caller for verification; the adapter itself
// logs nothing and puts no raw stdout/stderr (which could echo query data) into
// a thrown error — only a short sanitized reason. Injectable for tests.
import { execFile } from "node:child_process";
import process from "node:process";

function needsShell(command) {
  return process.platform === "win32" && /^(npm|npx|netlify|supabase)$/i.test(command);
}

/** Run a CLI command capturing stdout; rejects with a SANITIZED error. */
function capture(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: 180000, windowsHide: true, shell: needsShell(command), maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!err) return resolve(String(stdout));
        // Sanitize: surface only a short assertion/ERROR reason — never the raw
        // stderr blob (which can contain echoed query data) and never a secret.
        reject(new Error(sanitizeCliError(String(stderr || err.message))));
      },
    );
  });
}

/** Extract a short, safe reason from a CLI/Postgres error. */
export function sanitizeCliError(text) {
  const fail = /FAIL:[^"\\\n]{0,160}/.exec(text);
  if (fail) return fail[0].trim();
  const err = /ERROR:\s*[A-Z0-9]{0,6}:?\s*[^"\\\n]{0,160}/.exec(text);
  if (err) return err[0].trim();
  return "sql execution failed";
}

/** Parse the JSON envelope emitted by `db query --agent yes -o json`. */
export function parseQueryRows(stdout) {
  const start = stdout.indexOf("{");
  if (start === -1) return [];
  try {
    const parsed = JSON.parse(stdout.slice(start));
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch {
    return [];
  }
}

/**
 * @param {Object} [deps]
 * @param {(command:string,args:string[])=>Promise<string>} [deps.capture]
 */
export function createDbAdapter(deps = {}) {
  const run = deps.capture ?? capture;
  return {
    /** Run a read-only SQL query against the linked DB; return rows (array). */
    async query(sql) {
      const out = await run("supabase", ["db", "query", "--linked", "--agent", "yes", "-o", "json", sql]);
      return parseQueryRows(out);
    },
    /**
     * Execute a .sql assertion script file against the linked DB. The script
     * self-manages a transaction and ROLLBACKs; a RAISE EXCEPTION (assertion
     * failure) surfaces as a non-zero exit → { ok:false, error:<safe reason> }.
     * @param {string} path
     * @returns {Promise<{ok:boolean, error?:string}>}
     */
    async runScriptFile(path) {
      try {
        await run("supabase", ["db", "query", "--linked", "--agent", "yes", "-o", "json", "-f", path]);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "assertion failed" };
      }
    },
  };
}
