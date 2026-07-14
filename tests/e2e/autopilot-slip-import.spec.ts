import { expect, test } from "@playwright/test";
import { acquirePipelineLock, PIPELINE_LOCKED_TEST_TIMEOUT_MS } from "./helpers/pipeline-lock";

const email = `test-autopilot-${Date.now()}@example.test`;
const password = "password123";

async function signUpAndOnboard(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.getByRole("button", { name: "สมัครใหม่" }).click();
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();

  await expect
    .poll(() => new URL(page.url()).pathname)
    .toMatch(/^\/(onboarding|today)$/);
  await page.goto("/onboarding?edit=1");
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ Autopilot");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test.describe.serial("AI Financial Autopilot -- Slip Import vertical slice", () => {
  test.describe.configure({ timeout: PIPELINE_LOCKED_TEST_TIMEOUT_MS });

  let releasePipelineLock: (() => Promise<void>) | undefined;

  test.beforeEach(async ({}, testInfo) => {
    releasePipelineLock = await acquirePipelineLock({ label: testInfo.title });
  });

  test.afterEach(async () => {
    await releasePipelineLock?.();
    releasePipelineLock = undefined;
  });

  test("high-confidence delivery slip is auto-saved, appears in transactions, and can be undone", async ({ page }) => {
    await signUpAndOnboard(page);

    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "ใบเสร็จ/ค่าอาหาร" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "autopilot_delivery_grab.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("mock-delivery-data"),
    });
    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();

    // Confident receipt/delivery_receipt slips skip the manual review form
    // entirely -- the lightweight autopilot result screen is shown instead.
    await expect(page).toHaveURL(/\/upload\/result\//);
    await expect(page.getByText("TangLak จัดการให้แล้ว")).toBeVisible();

    // The transaction is immediately visible on the transactions list --
    // Overview/Budget read from the same canonical transaction data.
    await page.goto("/transactions");
    await expect(page.getByText("GrabFood")).toBeVisible();
    await expect(page.getByText("฿185").first()).toBeVisible();

    // The autopilot activity log shows the action with an undo affordance.
    await page.goto("/settings/autopilot-activity");
    await expect(page.getByText("สร้างรายการ")).toBeVisible();
    await expect(page.getByText("GrabFood")).toBeVisible();
    await page.getByRole("button", { name: "ยกเลิก" }).click();
    await expect(page.getByText("ยกเลิกแล้ว")).toBeVisible();

    // Undo actually removed the transaction -- Overview/Budget totals
    // revert along with it since they read from the same transaction table.
    await page.goto("/transactions");
    await expect(page.getByText("GrabFood")).toHaveCount(0);
  });

  test("a slip with an unclear core field (missing date) still falls back to the existing manual review form", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "ใบเสร็จ/ค่าอาหาร" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "autopilot_missing_date_receipt.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("mock-missing-date-data"),
    });
    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();

    // A missing/unclear occurredAt is never auto-decided -- deferred to the
    // existing review form, never a new confirmation UI.
    await expect(page).toHaveURL(/\/upload\/review\//);
    await page.locator("input[name='occurredAt']").fill("2026-07-15T09:30");
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();
    await expect(page).toHaveURL(/\/today/);
  });
});
