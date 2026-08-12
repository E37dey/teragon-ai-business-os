/// <reference types="node" />
// Gate S8.0 — the browser auth + Supabase source must carry NO privileged
// material. This scans the auth module and the Supabase adapter source and fails
// if any file READS a service-role / secret / db-password / admin-password /
// access-token, or embeds a literal secret / JWT. Comments are stripped first so
// the security-contract prose (which names these things to forbid them) never
// trips the scan — only real code is checked.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const SCAN_DIRS = [join(repoRoot, "src", "auth"), join(repoRoot, "src", "persistence", "supabase")];

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

// Real-code patterns that would indicate privileged material being handled.
const FORBIDDEN_CODE = [
  /service[_-]?role/i,
  /SUPABASE_SERVICE/i,
  /SERVICE_ROLE_KEY/i,
  /\bADMIN_PASSWORD\b/i,
  /\b(DB|DATABASE)_PASSWORD\b/i,
  /ACCESS_TOKEN/i,
  /VITE_SUPABASE_SECRET/i,
];
// Literal secret formats that must never appear ANYWHERE (even in comments).
const FORBIDDEN_LITERAL = [/sb_secret_[A-Za-z0-9]/, /eyJ[A-Za-z0-9_-]{20,}\./];

describe("browser auth/supabase source carries no privileged material", () => {
  const files = SCAN_DIRS.flatMap(collect);

  it("scans a non-empty set of source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no file READS privileged material (comments stripped)", () => {
    const hits: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, "utf8"));
      for (const re of FORBIDDEN_CODE) {
        if (re.test(code)) hits.push(`${f} :: ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("no file embeds a literal secret or JWT", () => {
    const hits: string[] = [];
    for (const f of files) {
      const raw = readFileSync(f, "utf8");
      for (const re of FORBIDDEN_LITERAL) {
        if (re.test(raw)) hits.push(`${f} :: ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("the browser client only reads the public URL + anon key", () => {
    const clientSrc = stripComments(
      readFileSync(join(repoRoot, "src", "persistence", "supabase", "client.ts"), "utf8"),
    );
    const envReads = [...clientSrc.matchAll(/import\.meta\.env\.(\w+)/g)].map((m) => m[1]);
    for (const key of envReads) {
      expect(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]).toContain(key);
    }
  });
});
