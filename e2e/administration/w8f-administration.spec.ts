// W8-F e2e — /administration (W8-C): role assignment, permission request →
// approve → verified (the approver identity is patched in IndexedDB because
// the single-identity demo UI can never decide its own request — documented),
// self-approval refused VISIBLY, invalid-combination refused constructively at
// request time, emergency agent disable reflected on /agents + command center,
// and keyboard navigation across the administration tabs. Zero console errors.
import { test, expect, type Page } from "@playwright/test";
import { collectConsoleErrors, gotoAdministration } from "../analytics/w8f-helpers";

test("role assignment via the canonical modal updates the user row", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoAdministration(page);

  await page.getByTestId("assign-role-u-maya").click();
  const modal = page.getByTestId("assign-role-modal");
  await expect(modal).toBeVisible();
  // assign the SAME canonical role (idempotent — no permission drift), the
  // full service path runs: reset overrides + audit
  await modal.locator("select").selectOption({ label: "מכירות" });
  await page.getByRole("button", { name: "הקצאה" }).click();
  await expect(page.getByText(/הוקצה התפקיד מכירות/)).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("self-approval is refused VISIBLY — approver list excludes the requester + submit without approver errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoAdministration(page);

  await page.getByTestId("request-change-u-maya").click();
  const modal = page.getByTestId("request-change-modal");
  await expect(modal).toBeVisible();

  // the approver dropdown NEVER offers the current actor (צחי) — structural
  const approverOptions = await modal
    .locator("#adm-req-approver option")
    .allTextContents();
  expect(approverOptions.join(" ")).not.toContain("צחי");

  // submitting without a named approver is refused with the honest reason
  await page.getByRole("button", { name: "שליחה לאישור" }).click();
  await expect(modal.getByRole("alert")).toContainText("אישור עצמי חסום");
  expect(errors).toEqual([]);
});

test("invalid combination is refused CONSTRUCTIVELY at request time (R3: מכירות + זיכרון מוגבל)", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoAdministration(page);

  // u-maya is מכירות — restricted technical memory is forbidden even for read
  await page.getByTestId("request-change-u-maya").click();
  const modal = page.getByTestId("request-change-modal");
  await modal.locator("#adm-req-domain").selectOption("memory-restricted");
  await modal.locator("#adm-req-level").selectOption({ index: 1 }); // קריאה
  await modal.locator("#adm-req-approver").selectOption({ index: 1 });
  await page.getByRole("button", { name: "שליחה לאישור" }).click();
  // the service throws a typed AdministrationError — shown as a visible warning
  await expect(modal.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

/**
 * Patch the pending request so its requester is מאיה and its approver is צחי —
 * the single-identity UI can then decide it. Documented injection: the demo has
 * ONE human identity, so a UI-created request is always self-requested and the
 * decide path is unreachable without this patch (the unit layer covers the
 * pure service flow; this exercises the real UI → service → engine wiring).
 */
async function patchRequestForApproval(page: Page, requestId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const patch = (store: string, key: string, fields: Record<string, unknown>) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("teragon-os");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(store, "readwrite");
          const os = tx.objectStore(store);
          const get = os.get(key);
          get.onsuccess = () => {
            const rec = get.result as Record<string, unknown> | undefined;
            if (rec) os.put({ ...rec, ...fields });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    await patch("accessChangeRequests", id, {
      requestedById: "u-maya",
      requestedByName: "מאיה לוי",
      approverId: "u-tzachi",
      approverName: "צחי זוסטייהם",
    });
    await patch("approvals", `${id}-ap-1`, { requestedById: "u-maya" });
  }, requestId);
}

test("permission request → approve → executed + VERIFIED by read-back", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoAdministration(page);

  // create a REAL request through the UI (valid combination: crm read → write
  // is not needed — keep the current level's domain at a harmless level)
  await page.getByTestId("request-change-u-maya").click();
  const modal = page.getByTestId("request-change-modal");
  await modal.locator("#adm-req-domain").selectOption("crm");
  await modal.locator("#adm-req-level").selectOption({ index: 1 }); // קריאה
  await modal.locator("#adm-req-approver").selectOption({ index: 1 });
  await expect(page.getByTestId("change-preview")).toBeVisible();
  await page.getByRole("button", { name: "שליחה לאישור" }).click();
  await expect(page.getByText(/בקשת השינוי נשלחה לאישור/)).toBeVisible({ timeout: 15_000 });

  // the pending request appears on the requests tab — decision honestly locked
  await page.getByRole("tab", { name: /בקשות שינוי/ }).click();
  const pendingRow = page.locator("tbody tr", { hasText: "ממתין" }).first();
  await expect(pendingRow).toBeVisible({ timeout: 15_000 });
  const requestId = await pendingRow.evaluate((tr) => {
    const btn = tr.querySelector("[data-testid^='approve-request-'],[data-testid^='reject-request-']");
    if (btn) return btn.getAttribute("data-testid")!.replace(/^(approve|reject)-request-/, "");
    // locked row — find the id from the first cell text is unreliable; read from
    // the row's dataset is unavailable, so fall back to empty and let the
    // patch step resolve the newest request
    return "";
  });

  // resolve the id from IndexedDB when the row is decision-locked
  const resolvedId =
    requestId ||
    (await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const open = indexedDB.open("teragon-os");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction("accessChangeRequests", "readonly");
            const req = tx.objectStore("accessChangeRequests").getAll();
            req.onsuccess = () => {
              const all = req.result as { id: string; status: string; updatedAt: string }[];
              const pending = all
                .filter((r) => r.status === "ממתין")
                .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
              db.close();
              resolve(pending[0]?.id ?? "");
            };
          };
        }),
    ));
  expect(resolvedId).not.toBe("");

  await patchRequestForApproval(page, resolvedId);
  await page.reload();
  await expect(page.getByTestId("administration-page")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: /בקשות שינוי/ }).click();

  // now צחי IS the named approver and NOT the requester — approve
  await page.getByTestId(`approve-request-${resolvedId}`).click();
  await expect(page.getByTestId("confirm-modal")).toBeVisible();
  await page.getByTestId("confirm-modal-confirm").click();
  await expect(page.getByText("הבקשה אושרה, בוצעה ואומתה בקריאה חוזרת")).toBeVisible({
    timeout: 20_000,
  });

  // the row is now executed (בוצע) — and the admin audit records the verify
  await expect(page.locator("tbody tr", { hasText: "בוצע" }).first()).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("tab", { name: "Audit" }).click();
  await expect(page.getByText(/אומת בקריאה חוזרת/).first()).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("emergency disable agent → /agents + command center reflect the disabled state", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoAdministration(page);

  await page.getByRole("tab", { name: /מצב חירום/ }).click();
  const disableBtn = page.locator("[data-testid^='emergency-disable-']").first();
  await expect(disableBtn).toBeVisible({ timeout: 15_000 });
  const agentTestId = await disableBtn.getAttribute("data-testid");
  const agentId = agentTestId!.replace("emergency-disable-", "");

  await disableBtn.click();
  await expect(page.getByTestId("confirm-modal")).toBeVisible();
  await page.locator("#adm-confirm-reason").fill("בדיקת קצה-לקצה W8-F — השבתה מבוקרת");
  await page.getByTestId("confirm-modal-confirm").click();
  await expect(page.getByText(/הופעלה ונרשמה ב-Audit/)).toBeVisible({ timeout: 15_000 });

  // /agents reflects the disabled agent honestly
  await page.goto("/agents");
  await expect(page.getByText("מושבת").first()).toBeVisible({ timeout: 30_000 });

  // command center's agent panel reflects it as well
  await page.goto("/");
  await expect(page.getByText("סוכני המערכת (מצב הדגמה מקומי)")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("מושבת").first()).toBeVisible({ timeout: 15_000 });
  expect(agentId).not.toBe("");
  expect(errors).toEqual([]);
});

test("keyboard navigation across the administration tabs (Tab + Enter)", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoAdministration(page);

  // focus the first tab, then walk the tablist with the keyboard only
  await page.getByRole("tab", { name: /משתמשים/ }).focus();
  await expect(page.getByRole("tab", { name: /משתמשים/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tab", { name: /תפקידים/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: /תפקידים/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("role-matrix")).toBeVisible();

  // keep walking to הרשאות and activate with Space
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(page.getByRole("tab", { name: "הרשאות" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("קטלוג ההרשאות")).toBeVisible();
  expect(errors).toEqual([]);
});
