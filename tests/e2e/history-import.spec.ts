import { expect, test } from "@playwright/test";
import { buildGenericBankStatementPdf, buildPasswordProtectedPdf } from "../fixtures/pdf-statements";
import { acquirePipelineLock } from "./helpers/pipeline-lock";

const email = `test-import-${Date.now()}@example.test`;
const password = "password123";

async function loginAndCompleteOnboarding(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.reload();
  await page.getByRole("button", { name: "สมัครใหม่" }).click();
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();

  await expect
    .poll(() => new URL(page.url()).pathname)
    .toMatch(/^\/(onboarding|today)$/);
  await page.goto("/onboarding?edit=1");
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้นำเข้าประวัติ");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test.describe.serial("History Statement Import Flow", () => {
  let releasePipelineLock: (() => Promise<void>) | undefined;

  test.beforeAll(async () => {
    releasePipelineLock = await acquirePipelineLock();
  });

  test.afterAll(async () => {
    await releasePipelineLock?.();
  });

  test("upload bank-statement PDF, review batch, confirm, and verify rollback", async ({ page }) => {
    await loginAndCompleteOnboarding(page);

    // 1. Go to settings and click link
    await page.goto("/settings");
    await page.getByText("ข้อมูลและการนำเข้า").click();
    await expect(page).toHaveURL(/\/settings\/data/);

    // 2. Go to history-import
    await page.getByRole("link", { name: "+ นำเข้า Statement ใหม่" }).click();
    await expect(page).toHaveURL(/\/history-import/);

    // 3. Upload a real, deterministically-generated 30-row bank statement PDF
    const buffer = await buildGenericBankStatementPdf();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("input[type='file']").click({ force: true });
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "statement_july.pdf",
      mimeType: "application/pdf",
      buffer,
    });

    // Submit
    await page.getByRole("button", { name: "ประมวลผลและนำเข้าชุดข้อมูล" }).click();

    // 4. Review Board Transition
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/review/);
    await expect(page.getByText("statement_july.pdf")).toBeVisible();
    await expect(page.getByRole("button", { name: "ทั้งหมด", exact: true })).toBeVisible();

    // Statement metadata detected from the fixture (bank name, masked account, layout badge)
    await expect(page.getByText("KBank")).toBeVisible();
    await expect(page.getByText("•••• 1234")).toBeVisible();

    // Deterministically parsed rows from the fixture are listed
    await expect(page.getByText("MERCHANT 001 BKK").first()).toBeVisible();
    await expect(page.getByText(/GRAB\*FOOD/).first()).toBeVisible();

    // 5. Submit Staging Rows
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ยืนยันการนำเข้าทั้งหมด" }).click();

    // 6. Summary View Transition
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/summary/);
    await expect(page.getByRole("heading", { name: "สรุปผลการนำเข้า" })).toBeVisible();
    await expect(page.getByText("นำเข้าธุรกรรมใหม่")).toBeVisible();

    // 7. Verify Transactions List opens in the imported statement month.
    await page.getByRole("link", { name: "ดูรายการธุรกรรมทั้งหมด" }).click();
    await expect(page).toHaveURL(/\/transactions\?month=2026-07&importBatchId=[a-f0-9-]+/);
    await expect(page.getByText("นำเข้าจาก Statement ชุดล่าสุด")).toBeVisible();
    await expect(page.getByText("MERCHANT 001 BKK").first()).toBeVisible();

    // 8. Rollback Batch
    await page.goto("/settings/data");
    await page.getByRole("button", { name: "ย้อนกลับ (Rollback)" }).click();

    // Verify transactions are deleted
    await page.goto("/transactions?month=2026-07");
    await expect(page.getByText("MERCHANT 001 BKK")).not.toBeVisible();

    // 9. Rollback is idempotent — calling it again on the now rolled-back batch is safe
    await page.goto("/settings/data");
    await expect(page.getByText("ย้อนกลับแล้ว")).toBeVisible();
  });

  test("password-protected PDF shows a Thai fallback message", async ({ page }) => {
    // Reuse session
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/history-import");

    const buffer = await buildPasswordProtectedPdf();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("input[type='file']").click({ force: true });
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "protected_statement.pdf",
      mimeType: "application/pdf",
      buffer,
    });

    // Submit
    await page.getByRole("button", { name: "ประมวลผลและนำเข้าชุดข้อมูล" }).click();

    // Should display a clear Thai error, not a raw stack trace
    await expect(page.getByText("Statement นี้มีรหัสผ่าน")).toBeVisible();
  });
});
