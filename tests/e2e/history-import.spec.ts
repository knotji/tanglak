import { expect, test } from "@playwright/test";

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

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้นำเข้าประวัติ");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test.describe.serial("History Statement Import Flow", () => {
  test("upload bank-statement PDF, review batch, confirm, and verify rollback", async ({ page }) => {
    await loginAndCompleteOnboarding(page);

    // 1. Go to settings and click link
    await page.goto("/settings");
    await page.getByText("ข้อมูลและการนำเข้า").click();
    await expect(page).toHaveURL(/\/settings\/data/);

    // 2. Go to history-import
    await page.getByRole("link", { name: "+ นำเข้า Statement ใหม่" }).click();
    await expect(page).toHaveURL(/\/history-import/);

    // 3. Upload Statement File
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("input[type='file']").click({ force: true });
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "statement_july.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("mock-pdf-data-no-encryption"),
    });

    // Submit
    await page.getByRole("button", { name: "ประมวลผลและนำเข้าชุดข้อมูล" }).click();

    // 4. Review Board Transition
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/review/);
    await expect(page.getByText("statement_july.pdf")).toBeVisible();
    await expect(page.getByRole("button", { name: "ทั้งหมด", exact: true })).toBeVisible();

    // Verify row items are listed (from mock result)
    await expect(page.getByText("Deposit Transfer KBank BKK").first()).toBeVisible();
    await expect(page.getByText("KTC Test Credit Card Payment").first()).toBeVisible();

    // 5. Submit Staging Rows
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "ยืนยันการนำเข้าทั้งหมด" }).click();

    // 6. Summary View Transition
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/summary/);
    await expect(page.getByRole("heading", { name: "สรุปผลการนำเข้า" })).toBeVisible();
    await expect(page.getByText("นำเข้าธุรกรรมใหม่")).toBeVisible();

    // 7. Verify Transactions List
    await page.goto("/transactions");
    // Mock entries should now be listed in transactions
    await expect(page.getByText("Deposit Transfer KBank BKK").first()).toBeVisible();

    // 8. Rollback Batch
    await page.goto("/settings/data");
    await page.getByRole("button", { name: "ย้อนกลับ (Rollback)" }).click();

    // Verify transactions are deleted
    await page.goto("/transactions");
    await expect(page.getByText("Deposit Transfer KBank BKK")).not.toBeVisible();
  });

  test("unsupported statement layout / password protection fallback", async ({ page }) => {
    // Reuse session
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/history-import");

    // Upload password protected PDF mock (contains /Encrypt in buffer)
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("input[type='file']").click({ force: true });
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "protected_statement.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("PDF header data /Encrypt catalog signature block"),
    });

    // Submit
    await page.getByRole("button", { name: "ประมวลผลและนำเข้าชุดข้อมูล" }).click();

    // Should display clear error in Thai
    await expect(page.getByText("Password-protected PDF files are not supported")).toBeVisible();
  });
});
