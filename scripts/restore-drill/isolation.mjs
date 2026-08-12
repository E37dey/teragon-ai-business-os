// S10.1-B PHASE 4 — run the repository's own 8 tenant-isolation proofs against
// the DISPOSABLE target. Each file is `begin … rollback`, so nothing persists.
import { readFileSync, readdirSync } from "node:fs";
import { token, drill, runSql } from "./drill-lib.mjs";

const tok = token();
const t = drill();
const files = readdirSync("supabase/tests").filter((f) => f.endsWith(".sql")).sort();
console.log(`isolationTests=${files.length} target=${t.ref}`);

let pass = 0, fail = 0;
for (const f of files) {
  const sql = readFileSync(`supabase/tests/${f}`, "utf8");
  const r = await runSql(t.ref, sql, tok);
  if (r.ok) { pass++; console.log(`${f} -> PASS`); }
  else {
    fail++;
    // Safe category only: these messages are assertion text, never row data.
    const msg = (/ERROR:\s+[A-Z0-9]+:\s*([^\\"\n]{0,160})/.exec(r.body) ?? [])[1] ?? `HTTP ${r.status}`;
    console.log(`${f} -> FAIL (${msg})`);
  }
}
console.log(`isolationPass=${pass}/${files.length} isolationFail=${fail}`);
process.exit(fail ? 1 : 0);
