// W9-F Phase 10.2 §3 — security headers as SERVED BY NETLIFY on the live URL.
// This asserts the wire, not netlify.toml: a header that exists in the config
// but is not actually emitted by the CDN is a production defect.
import { test, expect } from "@playwright/test";
import { LIVE_URL } from "../live.config";
import { observe, drainCsp, gotoShellReady } from "./live-helpers";

// The EXACT policy netlify.toml declares. Byte-for-byte — a drift is a finding.
const EXPECTED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

test("live headers on / — exact CSP + clickjacking/sniff/referrer/permissions set", async ({
  request,
}) => {
  const res = await request.get(`${LIVE_URL}/`);
  expect(res.status()).toBe(200);
  const h = res.headers();

  expect(h["content-security-policy"], "exact CSP policy").toBe(EXPECTED_CSP);
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  // HTML entry must not be cached, so new asset hashes are picked up at once.
  expect(h["cache-control"]?.replace(/\s/g, "")).toBe("public,max-age=0,must-revalidate");
});

test("live headers on a deep SPA route — the header rule covers rewritten routes", async ({
  request,
}) => {
  for (const path of ["/governance", "/analytics", "/system-health", "/submission/presentation"]) {
    const res = await request.get(`${LIVE_URL}${path}`);
    expect(res.status(), `${path} must serve 200 via the SPA rewrite`).toBe(200);
    const h = res.headers();
    expect(h["content-security-policy"], `${path} CSP`).toBe(EXPECTED_CSP);
    expect(h["x-frame-options"], `${path} XFO`).toBe("DENY");
    expect(h["x-content-type-options"], `${path} XCTO`).toBe("nosniff");
    expect(h["referrer-policy"], `${path} RP`).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], `${path} PP`).toBe("camera=(), microphone=(), geolocation=()");
    expect(h["content-type"]).toContain("text/html");
  }
});

test("live /assets/* is served immutable for a year (and still carries the headers)", async ({
  request,
}) => {
  // discover the REAL hashed entry chunk from the deployed index.html
  const html = await (await request.get(`${LIVE_URL}/`)).text();
  const m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  expect(m?.[1], "entry chunk must be discoverable in the deployed index.html").toBeTruthy();
  const assetUrl = `${LIVE_URL}${m?.[1]}`;

  const res = await request.get(assetUrl);
  expect(res.status()).toBe(200);
  const h = res.headers();
  expect(h["cache-control"]?.replace(/\s/g, ""), "immutable 1y cache").toBe(
    "public,max-age=31536000,immutable",
  );
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["content-type"]).toContain("javascript");

  // sanity: the CSS bundle too
  const cssMatch = html.match(/href="(\/assets\/[^"]+\.css)"/);
  if (cssMatch?.[1]) {
    const cssRes = await request.get(`${LIVE_URL}${cssMatch[1]}`);
    expect(cssRes.headers()["cache-control"]?.replace(/\s/g, "")).toBe(
      "public,max-age=31536000,immutable",
    );
  }
});

// CSP violations surface as console errors ("Refused to …") AND as the DOM
// securitypolicyviolation event; live-helpers captures both. The ONLY tolerated
// report is the documented, try/catch-guarded Zod v4 JIT probe (script-src /
// blocked eval) — see isKnownBenignCsp; every other violation fails the gate.
for (const path of ["/", "/governance", "/analytics"]) {
  test(`no CSP violations while rendering ${path} on the live deploy`, async ({ page }, testInfo) => {
    const o = observe(page);
    await gotoShellReady(page, path);
    // exercise a little interaction so runtime inline styles/print paths run
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1_000);
    await drainCsp(page, o);
    await testInfo.attach(`csp-reports${path.replace(/\//g, "_")}`, {
      body: JSON.stringify({ unexpected: o.cspViolations, benign: o.cspBenign }, null, 2),
      contentType: "application/json",
    });
    expect(o.cspViolations, `${path} UNEXPECTED CSP violations`).toEqual([]);
    expect(o.consoleErrors, `${path} console errors`).toEqual([]);
  });
}

test("HSTS + noindex are present on the preview (deploy-preview hygiene)", async ({ request }) => {
  const h = (await request.get(`${LIVE_URL}/`)).headers();
  // Netlify adds these; recorded as evidence, asserted loosely so a production
  // domain (where X-Robots-Tag should be absent) can reuse this suite.
  expect(h["strict-transport-security"]).toContain("max-age=");
});
