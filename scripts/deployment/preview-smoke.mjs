#!/usr/bin/env node
// TERAGON AI BUSINESS OS — local preview smoke (Phase 10.2 local half, W9-D).
// =============================================================================
// Proves the production BUILD is deployable BEFORE any operator touches Netlify:
//   1. builds dist/ (npm run build)
//   2. serves dist/ from an in-process static server that MIRRORS netlify.toml —
//      the SPA fallback (/* → index.html 200) AND the exact security/cache
//      headers, INCLUDING the Content-Security-Policy, parsed from netlify.toml
//      so there is a single source of truth. (vite preview would NOT serve the
//      Netlify headers; this does, so the CSP is exercised over the wire.)
//   3. fetches every route from src/app/routes.ts (each direct URL — the deep-
//      link case a real user hits on refresh) and asserts 200 + index.html body
//      markers (proves SPA fallback), and that the CSP header is present.
//   4. fetches a real hashed asset and asserts 200 + immutable cache header.
//   5. runs the bundle secret scan (npm run scan:secrets) against dist/.
//
// It authenticates to nothing and contacts no external host. Netlify Deploy
// Preview itself remains an OPERATOR step (see docs/DEPLOYMENT.md).
//
// Exit 0 = all green · 1 = any failure.
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";
import process from "node:process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = join(ROOT, "dist");
const PORT = 4319;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  return false;
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
  return true;
}

// --- 0. routes (single source of truth: src/app/routes.ts) ------------------
function readRoutes() {
  const src = readFileSync(join(ROOT, "src", "app", "routes.ts"), "utf8");
  const paths = [];
  const re = /navPath:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) paths.push(m[1]);
  // /design exists in the router but not in APP_ROUTES — include it too.
  if (!paths.includes("/design")) paths.push("/design");
  return [...new Set(paths)];
}

// --- 1. parse the [[headers]] for="/*" CSP from netlify.toml -----------------
function readCspHeader() {
  const toml = readFileSync(join(ROOT, "netlify.toml"), "utf8");
  const m = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(toml);
  return m ? m[1] : null;
}

// --------------------------------------------------------------------------
console.log("=== preview-smoke (W9-D) ===");

// build
console.log("[1/5] building dist/ …");
const build = spawnSync("npm", ["run", "build"], {
  cwd: ROOT,
  encoding: "utf8",
  shell: process.platform === "win32",
});
if (build.status !== 0) {
  console.error(build.stdout || "");
  console.error(build.stderr || "");
  console.error("BUILD FAILED — aborting smoke.");
  process.exit(1);
}
if (!existsSync(join(DIST, "index.html"))) {
  console.error("dist/index.html missing after build — aborting.");
  process.exit(1);
}
ok("build succeeded, dist/index.html present");

const CSP = readCspHeader();
const routes = readRoutes();
const indexHtml = readFileSync(join(DIST, "index.html"), "utf8");
// a distinctive marker proving index.html (not some other file) was served
const INDEX_MARKER = '<div id="root">';

// --- static server mirroring netlify.toml ----------------------------------
const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  ...(CSP ? { "Content-Security-Policy": CSP } : {}),
};

function extname(p) {
  const i = p.lastIndexOf(".");
  return i < 0 ? "" : p.slice(i).toLowerCase();
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  const headers = { ...SECURITY_HEADERS };

  // try to serve a real file (assets/, favicon.svg, …)
  const candidate = normalize(join(DIST, pathname));
  if (candidate.startsWith(DIST) && pathname !== "/" && existsSync(candidate) && statSync(candidate).isFile()) {
    const ext = extname(candidate);
    headers["Content-Type"] = MIME[ext] || "application/octet-stream";
    if (pathname.startsWith("/assets/")) headers["Cache-Control"] = "public, max-age=31536000, immutable";
    res.writeHead(200, headers);
    res.end(readFileSync(candidate));
    return;
  }
  // SPA fallback — every other path serves index.html with 200 (netlify redirect)
  headers["Content-Type"] = "text/html; charset=utf-8";
  headers["Cache-Control"] = "public, max-age=0, must-revalidate";
  res.writeHead(200, headers);
  res.end(indexHtml);
});

async function run() {
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${PORT}`;
  let allGreen = true;

  // --- 2/5 CSP header presence ---------------------------------------------
  console.log("[2/5] CSP + security headers served …");
  if (!CSP) allGreen = fail("no Content-Security-Policy found in netlify.toml") && allGreen;
  else {
    const probe = await fetch(`${base}/`);
    const served = probe.headers.get("content-security-policy");
    if (served && served.includes("default-src 'self'") && served.includes("script-src 'self'"))
      ok("CSP header served (default-src 'self'; script-src 'self'; …)");
    else allGreen = fail(`CSP header not served correctly: ${served}`) && allGreen;
    for (const h of ["x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"]) {
      if (!probe.headers.get(h)) allGreen = fail(`missing security header: ${h}`) && allGreen;
    }
    ok("X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy present");
  }

  // --- 3/5 every route → 200 + SPA fallback --------------------------------
  console.log(`[3/5] fetching ${routes.length} routes (direct deep-link URLs) …`);
  let routePass = 0;
  const routeFailures = [];
  for (const r of routes) {
    try {
      const resp = await fetch(`${base}${r}`);
      const body = await resp.text();
      if (resp.status === 200 && body.includes(INDEX_MARKER)) routePass += 1;
      else routeFailures.push(`${r} → status ${resp.status}, index marker ${body.includes(INDEX_MARKER)}`);
    } catch (e) {
      routeFailures.push(`${r} → ${String(e)}`);
    }
  }
  if (routeFailures.length === 0) ok(`all ${routePass}/${routes.length} routes served index.html with 200`);
  else {
    allGreen = false;
    for (const f of routeFailures) fail(f);
  }

  // --- 4/5 hashed asset serves with immutable cache ------------------------
  console.log("[4/5] hashed asset load + cache header …");
  const assetMatch = /\/assets\/[A-Za-z0-9._-]+\.js/.exec(indexHtml);
  if (!assetMatch) allGreen = fail("could not find a hashed asset in index.html") && allGreen;
  else {
    const resp = await fetch(`${base}${assetMatch[0]}`);
    const cache = resp.headers.get("cache-control") || "";
    if (resp.status === 200 && cache.includes("immutable"))
      ok(`asset ${assetMatch[0]} → 200, ${cache}`);
    else allGreen = fail(`asset ${assetMatch[0]} → ${resp.status}, cache "${cache}"`) && allGreen;
  }

  server.close();

  // --- 5/5 no secret in dist ------------------------------------------------
  console.log("[5/5] bundle secret scan (scan:secrets) …");
  const scan = spawnSync("npm", ["run", "scan:secrets"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (scan.status === 0 && /CLEAN — 0 findings/.test(scan.stdout || "")) ok("scan:secrets CLEAN — 0 findings");
  else {
    allGreen = false;
    console.error(scan.stdout || "");
    fail(`scan:secrets exited ${scan.status}`);
  }

  console.log("");
  console.log(allGreen ? "RESULT: PREVIEW SMOKE PASS ✓" : "RESULT: PREVIEW SMOKE FAIL ✗");
  process.exit(allGreen ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  try {
    server.close();
  } catch {
    // ignore
  }
  process.exit(1);
});
