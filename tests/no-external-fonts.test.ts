// Static guards: no external font origin in the CSP, the approved system Hebrew
// font stack in tokens, and no font <link>/@import in index.html. Fast + runs in
// Vitest (complements the Playwright network proof in e2e/no-external-fonts.spec.ts).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (p: string): string => readFileSync(resolve(root, p), "utf8");

describe("no external font dependency", () => {
  it("CSP allows no fonts.googleapis.com / fonts.gstatic.com", () => {
    const toml = read("netlify.toml");
    const csp = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(toml)?.[1] ?? "";
    expect(csp).not.toContain("fonts.googleapis.com");
    expect(csp).not.toContain("fonts.gstatic.com");
    // restrictive posture preserved
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("script-src 'self'");
  });

  it("the token font stack is the approved system Hebrew stack (no webfont names)", () => {
    const tokens = read("src/styles/tokens.css");
    const osFont = /--os-font:\s*([^;]+);/.exec(tokens)?.[1] ?? "";
    expect(osFont).toContain("Segoe UI");
    expect(osFont).toContain("Arial Hebrew");
    expect(osFont.toLowerCase()).not.toContain("heebo");
    expect(osFont.toLowerCase()).not.toContain("assistant");
    expect(osFont.toLowerCase()).not.toContain("googleapis");
  });

  it("index.html requests no external font (no link/@import to a font CDN)", () => {
    const html = read("index.html");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    expect(html.toLowerCase()).not.toMatch(/rel=["']?(preconnect|preload|stylesheet)["']?[^>]*font/i);
  });

  it("the print stylesheet uses the approved system stack", () => {
    const print = read("src/modules/quotations/printView.ts");
    const body = /body\s*\{[^}]*font-family:\s*([^;]+);/.exec(print)?.[1] ?? "";
    expect(body).toContain("Segoe UI");
    expect(body.toLowerCase()).not.toContain("heebo");
    expect(body.toLowerCase()).not.toContain("assistant");
  });
});
