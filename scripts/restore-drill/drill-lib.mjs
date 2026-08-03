// S10.1-B — shared helpers. Token and passwords stay in memory only.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const STAGING_REF = "bjvirkmagwpqroakazjj";
export const API = "https://api.supabase.com";

export function token() {
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/restore-drill/read-token.ps1"],
    { encoding: "utf8" },
  );
  if (r.status !== 0 || !r.stdout) throw new Error("token unavailable");
  return r.stdout.trim();
}

export function drill() {
  const txt = readFileSync(".env.restore-drill.local", "utf8");
  const get = (k) => (new RegExp(`^${k}=(.*)$`, "m").exec(txt) ?? [])[1] ?? "";
  const ref = get("DRILL_PROJECT_REF");
  if (!ref || ref === STAGING_REF) throw new Error("invalid drill ref");
  return { name: get("DRILL_PROJECT_NAME"), ref, region: get("DRILL_REGION") };
}

/** Run SQL against a project via the Management API. TARGET IS GUARDED. */
export async function runSql(ref, sql, tok) {
  if (ref === STAGING_REF) throw new Error("REFUSED: staging is never a SQL target");
  const r = await fetch(`${API}/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) return { ok: false, status: r.status, body: text.slice(0, 400) };
  try { return { ok: true, rows: JSON.parse(text) }; } catch { return { ok: true, rows: [] }; }
}

/** READ-ONLY query against staging — rejects anything that is not a SELECT. */
export async function readStaging(sql, tok) {
  if (!/^\s*select\b/i.test(sql)) throw new Error("REFUSED: staging accepts SELECT only");
  const r = await fetch(`${API}/v1/projects/${STAGING_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, read_only: true }),
  });
  const text = await r.text();
  if (!r.ok) return { ok: false, status: r.status, body: text.slice(0, 300) };
  try { return { ok: true, rows: JSON.parse(text) }; } catch { return { ok: true, rows: [] }; }
}
