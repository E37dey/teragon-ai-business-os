// Phase 0 live spike runner (dev-only). Starts:
//   1) the loopback bridge (127.0.0.1:5200, READ-ONLY) with a fresh pairing token
//   2) a tiny static server (127.0.0.1:5199 → "http://localhost:5199" origin) serving
//      diag.html with the token injected at serve time (token NEVER written to disk).
// Then a real browser (opened by the caller) loads http://localhost:5199/diag.html
// and performs cross-origin fetches to the bridge, proving the browser transport.
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createBridge, generateToken } from "../../obsidian-plugin/teragon-vault-bridge/bridgeServer.mjs";
import { mockVault } from "../../obsidian-plugin/teragon-vault-bridge/mockVault.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const BRIDGE_PORT = 5200;
const DIAG_PORT = 5199;
const DIAG_ORIGIN = `http://localhost:${DIAG_PORT}`;
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;
// The TERAGON dev preview origin(s) allowed to call the bridge from a real browser.
const ALLOWED = [DIAG_ORIGIN, "http://localhost:4173", "http://127.0.0.1:4173"];

// Dev spike token: env override lets the harness drive a real browser fetch; else random.
const token = process.env.BRIDGE_TOKEN || generateToken();

// 1) the read-only loopback bridge — only the explicit dev origins are allowed.
const bridge = createBridge({ token, allowedOrigins: ALLOWED, vault: mockVault(3) });
await bridge.start(BRIDGE_PORT);

// 2) static diag server on loopback; injects the token + bridge URL at serve time.
const diagTemplate = readFileSync(join(here, "diag.html"), "utf8");
const diag = http.createServer((req, res) => {
  if ((req.url || "/").startsWith("/diag")) {
    const html = diagTemplate.replace("__BRIDGE_URL__", BRIDGE_URL).replace("__BRIDGE_TOKEN__", token);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(html);
  }
  res.writeHead(404).end("not found");
});
await new Promise((r) => diag.listen(DIAG_PORT, "127.0.0.1", r));

// token printed to stdout ONLY (never persisted); the caller does not commit it.
console.log(`SPIKE READY bridge=${BRIDGE_URL} diag=${DIAG_ORIGIN}/diag.html tokenLen=${token.length}`);

function shutdown() {
  Promise.allSettled([bridge.close(), new Promise((r) => diag.close(r))]).then(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
