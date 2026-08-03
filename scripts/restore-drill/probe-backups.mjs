// S10.1-B — READ-ONLY capability probe. Determines whether a NATIVE
// restore-to-new-project / PITR path exists before falling back to a logical
// backup. Touches staging with GET requests only.
import { spawnSync } from "node:child_process";

const STAGING = "bjvirkmagwpqroakazjj";
function token() {
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/restore-drill/read-token.ps1"], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) throw new Error("token unavailable");
  return r.stdout.trim();
}
const H = { Authorization: `Bearer ${token()}` };
const API = "https://api.supabase.com";

for (const [label, url] of [
  ["staging backups", `${API}/v1/projects/${STAGING}/database/backups`],
  ["org subscription", `${API}/v1/organizations/vthlolcsedczobrxiacs`],
]) {
  const r = await fetch(url, { headers: H });
  const t = await r.text();
  console.log(`--- ${label}: HTTP ${r.status}`);
  // Safe: these endpoints return metadata only (no credentials).
  console.log(t.slice(0, 600));
}
