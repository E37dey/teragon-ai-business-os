// S10.1-B — create the DISPOSABLE restore-drill project via the Management API.
// The CLI requires --db-password in argv (forbidden), so the password travels in
// the JSON BODY and the access token is read from the CLI's own credential store
// into memory. Neither is ever printed, logged, argv'd or committed.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const STAGING_REF = "bjvirkmagwpqroakazjj"; // NEVER a target
const ORG = "vthlolcsedczobrxiacs";
const REGION = "eu-central-1";

function token() {
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/restore-drill/read-token.ps1"],
    { encoding: "utf8" },
  );
  if (r.status !== 0 || !r.stdout) throw new Error("token unavailable");
  return r.stdout.trim();
}

const TOKEN = token();
const API = "https://api.supabase.com";
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

// 1. validate the token WITHOUT revealing it
const probe = await fetch(`${API}/v1/projects`, { headers: H });
console.log(`tokenValid=${probe.ok} status=${probe.status}`);
if (!probe.ok) process.exit(2);

const suffix = randomBytes(3).toString("hex");
const NAME = `teragon-restoredrill-20260803-${suffix}`;
const dbPassword = `Drill-${randomBytes(24).toString("base64url")}-9!`;

const res = await fetch(`${API}/v1/projects`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: NAME,
    organization_id: ORG,
    region: REGION,
    db_pass: dbPassword,
    // desired_instance_size intentionally omitted: free-plan organizations
    // reject it (402), and the drill needs no particular instance size.
  }),
});

const text = await res.text();
if (!res.ok) {
  console.log(`create status=${res.status}`);
  // Safe category only — never echo the body verbatim if it could carry input.
  console.log(`safe body: ${text.replace(dbPassword, "[REDACTED]").slice(0, 400)}`);
  process.exit(3);
}

const body = JSON.parse(text);
const ref = body.id ?? body.ref;
if (!ref) { console.log("create returned no ref"); process.exit(4); }
if (ref === STAGING_REF) {
  console.error("ABORT — resolved ref equals STAGING.");
  process.exit(5);
}

writeFileSync(
  ".env.restore-drill.local",
  [
    "# S10.1-B disposable restore-drill credentials — gitignored, deleted at cleanup.",
    `DRILL_PROJECT_NAME=${NAME}`,
    `DRILL_PROJECT_REF=${ref}`,
    `DRILL_REGION=${body.region ?? REGION}`,
    `DRILL_DB_PASSWORD=${dbPassword}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);

console.log(`created name=${NAME}`);
console.log(`ref=${ref}`);
console.log(`region=${body.region ?? REGION}`);
console.log(`org=${body.organization_id ?? ORG}`);
console.log(`status=${body.status ?? "(pending)"}`);
console.log(`refDiffersFromStaging=${ref !== STAGING_REF}`);
