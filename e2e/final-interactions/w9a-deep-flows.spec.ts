// W9-A · FINAL RUNTIME INTERACTION AUDIT — deep interaction flows.
//
// The census proves NO dead controls exist; these flows prove the honesty
// contracts actually FIRE at runtime for the two hardest control classes:
//   1. Destructive action gated by a double-confirm — the confirm button is
//      disabled WITH a visible Hebrew reason until the exact word is typed,
//      then enables. (We cancel — never actually wipe the demo data.)
//   2. A disabled control surfaces its Hebrew reason via title/aria (the
//      OsButton disabledReason contract) rather than being silently inert.
// Run: npx playwright test -c e2e/w9a.config.ts
import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.locator("nav.os-nav, main").first().waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle").catch(() => {});
}

test.describe("destructive-confirm honesty (settings demo reset)", () => {
  test("reset confirm button stays disabled with a Hebrew reason until «אפס» is typed", async ({
    page,
  }) => {
    await page.goto("/settings");
    await ready(page);

    // switch to the "הדגמה" (demo) settings group where the reset lives
    await page.getByRole("tab", { name: "הדגמה" }).click();

    const openReset = page.getByRole("button", { name: /איפוס נתוני הדגמה דטרמיניסטי/ });
    await expect(openReset).toBeVisible();
    await openReset.click();

    const dialog = page.getByRole("dialog", { name: /אישור כפול/ });
    await expect(dialog).toBeVisible();

    // the confirm button is disabled — and NOT silently: its wrapper exposes
    // the Hebrew reason (OsButton honesty contract).
    const confirmBtn = dialog.getByRole("button", { name: "איפוס עכשיו" });
    await expect(confirmBtn).toBeDisabled();
    // its wrapper span carries the Hebrew reason (OsButton honesty contract)
    const wrap = dialog.locator(".os-btn-wrap[data-disabled-reason]");
    await expect(wrap).toHaveAttribute("data-disabled-reason", /יש להקליד/);

    // typing the wrong word keeps it disabled
    const field = dialog.getByRole("textbox", { name: "מילת אישור" });
    await field.fill("לא-נכון");
    await expect(confirmBtn).toBeDisabled();

    // typing the exact confirm word enables the action
    await field.fill("אפס");
    await expect(confirmBtn).toBeEnabled();

    // cancel — we verify the GATE, we do NOT wipe the deterministic demo data
    await dialog.getByRole("button", { name: "ביטול" }).click();
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("disabled-reason surfacing (header quick-add before wiring is a no-op case)", () => {
  test("every disabled control reachable on /settings exposes a non-empty reason", async ({
    page,
  }) => {
    await page.goto("/settings");
    await ready(page);

    // enumerate disabled controls and assert each carries a visible reason
    const missing = await page.evaluate(() => {
      const out: string[] = [];
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>("button, [role='button'], input, select, textarea"),
      );
      for (const el of nodes) {
        const disabled =
          (el as HTMLButtonElement).disabled === true ||
          el.getAttribute("aria-disabled") === "true";
        if (!disabled) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue; // not visible
        const wrap = el.closest(".os-btn-wrap");
        const reason =
          el.getAttribute("data-disabled-reason") ||
          el.getAttribute("title") ||
          el.getAttribute("aria-label") ||
          wrap?.getAttribute("data-disabled-reason") ||
          wrap?.getAttribute("aria-label") ||
          wrap?.getAttribute("title") ||
          "";
        if (!reason.trim()) out.push(el.outerHTML.slice(0, 80));
      }
      return out;
    });
    expect(missing, `disabled controls with no reason:\n${missing.join("\n")}`).toEqual([]);
  });
});
