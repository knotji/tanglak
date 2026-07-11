import { expect, test } from "@playwright/test";
import { buildCustomStatementPdf } from "../fixtures/pdf-statements";
import { acquirePipelineLock } from "./helpers/pipeline-lock";

const email = `test-import-selection-${Date.now()}@example.test`;
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

test.describe.serial("History Statement Import Selection E2E", () => {
  let releasePipelineLock: (() => Promise<void>) | undefined;

  test.beforeAll(async () => {
    releasePipelineLock = await acquirePipelineLock();
  });

  test.afterAll(async () => {
    await releasePipelineLock?.();
  });

  test("runs all import review selection test scenarios sequentially in a single user session", async ({ page }) => {
    await loginAndCompleteOnboarding(page);

    // ============================================
    // SCENARIO 1: 1-row statement import flow
    // ============================================
    await page.goto("/settings/data");
    await page.getByRole("link", { name: "+ นำเข้า Statement ใหม่" }).click();

    const buffer1 = await buildCustomStatementPdf(1, 2567, 10000);
    const fileChooserPromise1 = page.waitForEvent("filechooser");
    await page.locator("input[type='file']").click({ force: true });
    const fileChooser1 = await fileChooserPromise1;
    await fileChooser1.setFiles({
      name: "statement_1row.pdf",
      mimeType: "application/pdf",
      buffer: buffer1,
    });

    await page.getByRole("button", { name: "ประมวลผลและนำเข้าชุดข้อมูล" }).click();

    // Review Board
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/review/);
    await expect(page.getByText("เลือก 1 จาก 1 รายการ")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ยืนยันการนำเข้าทั้งหมด (1 รายการ)" }).click();

    // Summary Board
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/summary/);
    await expect(page.getByText("1 รายการ").first()).toBeVisible();

    // ============================================
    // SCENARIO 2: 20-row statement import with partial selection
    // ============================================
    await page.goto("/settings/data");
    await page.getByRole("link", { name: "+ นำเข้า Statement ใหม่" }).click();

    const buffer2 = await buildCustomStatementPdf(20, 2568, 20000);
    const fileChooserPromise2 = page.waitForEvent("filechooser");
    await page.locator("input[type='file']").click({ force: true });
    const fileChooser2 = await fileChooserPromise2;
    await fileChooser2.setFiles({
      name: "statement_20rows.pdf",
      mimeType: "application/pdf",
      buffer: buffer2,
    });

    await page.getByRole("button", { name: "ประมวลผลและนำเข้าชุดข้อมูล" }).click();

    // Review Board
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/review/);
    await expect(page.getByText("เลือก 20 จาก 20 รายการ")).toBeVisible();

    // Test Exclude All
    await page.getByRole("button", { name: "ยกเลิกทั้งหมด" }).click();
    await expect(page.getByText("เลือก 0 จาก 20 รายการ")).toBeVisible();

    // Test Select All
    await page.getByRole("button", { name: "เลือกทั้งหมด" }).click();
    await expect(page.getByText("เลือก 20 จาก 20 รายการ")).toBeVisible();

    // Exclude 3 rows. The toggle buttons initially say "ไม่นำเข้า" (meaning clicking them will exclude)
    const toggleButtons = page.locator("button[aria-pressed]");
    await expect(toggleButtons).toHaveCount(20);

    await toggleButtons.nth(0).click();
    await toggleButtons.nth(1).click();
    await toggleButtons.nth(2).click();

    await expect(page.getByText("เลือก 17 จาก 20 รายการ")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ยืนยันการนำเข้าทั้งหมด (17 รายการ)" }).click();

    // Summary Board
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/summary/);
    await expect(page.getByText("17 รายการ")).toBeVisible();
    await expect(page.getByText("3 รายการ")).toBeVisible();

    // ============================================
    // SCENARIO 3: 200+ row statement import selection stability
    // ============================================
    await page.goto("/settings/data");
    await page.getByRole("link", { name: "+ นำเข้า Statement ใหม่" }).click();

    const buffer3 = await buildCustomStatementPdf(205, 2570, 50000);
    const fileChooserPromise3 = page.waitForEvent("filechooser");
    await page.locator("input[type='file']").click({ force: true });
    const fileChooser3 = await fileChooserPromise3;
    await fileChooser3.setFiles({
      name: "statement_205rows.pdf",
      mimeType: "application/pdf",
      buffer: buffer3,
    });

    await page.getByRole("button", { name: "ประมวลผลและนำเข้าชุดข้อมูล" }).click();

    // Review Board
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/review/);
    await expect(page.getByText("เลือก 205 จาก 205 รายการ")).toBeVisible();

    // Toggle 1 row (from include to exclude)
    const toggleButtons3 = page.locator("button[aria-pressed]");
    await toggleButtons3.first().click();

    await expect(page.getByText("เลือก 204 จาก 205 รายการ")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ยืนยันการนำเข้าทั้งหมด (204 รายการ)" }).click();

    // Summary Board
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/summary/, { timeout: 25000 });
    await expect(page.getByText("204 รายการ")).toBeVisible();
    await expect(page.getByText("1 รายการ").first()).toBeVisible();

    // ============================================
    // SCENARIO 4: duplicate row exclusion and override behavior
    // ============================================
    // We upload the same 1-row statement again to trigger duplicate checking.
    await page.goto("/settings/data");
    await page.getByRole("link", { name: "+ นำเข้า Statement ใหม่" }).click();

    const buffer4 = await buildCustomStatementPdf(1, 2567, 10000);
    const fileChooserPromise4 = page.waitForEvent("filechooser");
    await page.locator("input[type='file']").click({ force: true });
    const fileChooser4 = await fileChooserPromise4;
    await fileChooser4.setFiles({
      name: "statement_dup.pdf",
      mimeType: "application/pdf",
      buffer: buffer4,
    });

    await page.getByRole("button", { name: "ประมวลผลและนำเข้าชุดข้อมูล" }).click();

    // Review Board
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/review/);
    // Since it's duplicate, it should be excluded by default, Y = 1, X = 0.
    await expect(page.getByText("เลือก 0 จาก 1 รายการ")).toBeVisible();

    // Duplicate button should show "นำเข้า" (because it's excluded by default)
    const toggleButton = page.locator("button[aria-pressed]");
    await expect(toggleButton).toHaveText("นำเข้า");
    await expect(toggleButton).toHaveAttribute("aria-pressed", "false");

    // Click toggle button to override and include the duplicate row
    await toggleButton.click();

    await expect(page.getByText("เลือก 1 จาก 1 รายการ")).toBeVisible();
    await expect(toggleButton).toHaveText("ไม่นำเข้า");
    await expect(toggleButton).toHaveAttribute("aria-pressed", "true");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ยืนยันการนำเข้าทั้งหมด (1 รายการ)" }).click();

    // Summary Board
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/summary/);
    await expect(page.getByText("1 รายการ").first()).toBeVisible();
  });
});
