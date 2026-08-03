// S10.1-B PHASE 6 — delete the disposable project and PROVE it is gone.
// Guarded: refuses to delete anything that is not the recorded drill ref, and
// refuses staging outright.
import { existsSync, rmSync } from "node:fs";
import { token, drill, API, STAGING_REF } from "./drill-lib.mjs";

const tok = token();
const t = drill();
if (t.ref === STAGING_REF) { console.error("ABORT — refuses to delete staging"); process.exit(9); }
if (!/^teragon-restoredrill-/.test(t.name)) {
  console.error("ABORT — target name is not a disposal-specific drill project");
  process.exit(9);
}
const H = { Authorization: `Bearer ${tok}` };

console.log(`deleting ref=${t.ref} name=${t.name}`);
const del = await fetch(`${API}/v1/projects/${t.ref}`, { method: "DELETE", headers: H });
console.log(`deleteStatus=${del.status}`);

// Verify disposal via the API — absence, not assumption.
await new Promise((r) => setTimeout(r, 5000));
const list = await fetch(`${API}/v1/projects`, { headers: H });
const projects = await list.json();
const stillThere = projects.find((p) => (p.id ?? p.ref) === t.ref);
const staging = projects.find((p) => (p.id ?? p.ref) === STAGING_REF);
console.log(`drillProjectStillExists=${Boolean(stillThere)}${stillThere ? ` status=${stillThere.status}` : ""}`);
console.log(`stagingPresent=${Boolean(staging)} stagingStatus=${staging?.status ?? "-"}`);

// Remove local credential + any dump artifacts.
for (const f of [".env.restore-drill.local"]) {
  if (existsSync(f)) { rmSync(f, { force: true }); }
  console.log(`localFileRemoved ${f}=${!existsSync(f)}`);
}
