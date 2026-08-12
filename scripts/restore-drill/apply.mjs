// S10.1-B PHASE 3 — apply migrations 001..014 (+ approved seed) into the
// DISPOSABLE drill project only. Staging is never a target: runSql refuses it.
import { readFileSync, readdirSync } from "node:fs";
import { token, drill, runSql } from "./drill-lib.mjs";

const tok = token();
const t = drill();
console.log(`target ref=${t.ref} name=${t.name}`);

const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
console.log(`migrations found=${files.length}`);
if (files.length !== 14) { console.error("ABORT — expected exactly 14 migrations"); process.exit(2); }

const t0 = Date.now();
for (const f of files) {
  const sql = readFileSync(`supabase/migrations/${f}`, "utf8");
  const r = await runSql(t.ref, sql, tok);
  console.log(`${f} -> ${r.ok ? "ok" : `FAIL ${r.status} ${r.body}`}`);
  if (!r.ok) process.exit(3);
}

if (process.argv.includes("--seed")) {
  const seed = readFileSync("supabase/seed/staging_seed.sql", "utf8");
  const r = await runSql(t.ref, seed, tok);
  console.log(`seed -> ${r.ok ? "ok" : `FAIL ${r.status} ${r.body}`}`);
  if (!r.ok) process.exit(4);
}
console.log(`applyElapsedSec=${Math.round((Date.now() - t0) / 1000)}`);
