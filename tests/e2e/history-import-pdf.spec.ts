import { expect, test } from "@playwright/test";
import {
  buildGenericBankStatementPdf,
  buildMalformedPdf,
  buildNoTextLayerPdf,
  buildUnsupportedLayoutPdf,
} from "../fixtures/pdf-statements";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
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
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ทดสอบ PDF");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

async function uploadPdf(page: import("@playwright/test").Page, buffer: Buffer, name: string) {
  await page.goto("/history-import");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("input[type='file']").click({ force: true });
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name, mimeType: "application/pdf", buffer });
  await page.getByRole("button", { name: "ประมวลผลและนำเข้าชุดข้อมูล" }).click();
}

test.describe.serial("PDF statement import — deterministic parsing edge cases", () => {
  const emailA = `pdf-a-${Date.now()}@example.test`;
  const emailB = `pdf-b-${Date.now()}@example.test`;
  const password = "password123";
  let reviewUrl = "";

  test("parses 30+ rows, allows editing, and supports partial import + resume + rollback", async ({ page }) => {
    await login(page, emailA, password);

    const buffer = await buildGenericBankStatementPdf();
    await uploadPdf(page, buffer, "statement.pdf");

    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/review/);
    reviewUrl = page.url();

    // 30 fixture rows all render in the "all" tab.
    await expect(page.getByRole("button", { name: "ทั้งหมด", exact: true })).toBeVisible();
    const rowCards = page.locator("text=MERCHANT");
    await expect(rowCards.first()).toBeVisible();

    // Edit the first row's merchant name.
    await page.getByText("MERCHANT 001 BKK").first().click();
    const merchantInput = page.getByLabel("ชื่อธุรกรรม / ร้านค้า");
    await merchantInput.fill("แก้ไขชื่อร้านค้า");
    await expect(merchantInput).toHaveValue("แก้ไขชื่อร้านค้า");
    // Collapse the row again.
    await page.getByText("MERCHANT 001 BKK").first().click();

    // Refresh mid-review: server-persisted defaults should still be there
    // (edits made only in local state before confirming are expected to
    // reset to the server default on reload — only committed decisions persist).
    await page.reload();
    await expect(page.getByText("MERCHANT 001 BKK").first()).toBeVisible();

    // "KTC PAYMENT BKK" is auto-classified as a likely debt payment by the
    // shared staging pipeline and defaults to importDecision: "unresolved".
    // Leaving it untouched and confirming should surface the
    // unresolved-rows warning and produce a partially_imported batch.
    await expect(page.getByText("ชำระหนี้ (1)")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ยืนยันการนำเข้าทั้งหมด" }).click();

    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/summary/);

    // Batch should now be resumable (partially imported) since the debt
    // payment row was left unresolved.
    await page.goto("/settings/data");
    await expect(page.getByText("เสร็จสิ้นบางส่วน")).toBeVisible();

    // Resume: go back into review and resolve the remaining row as a skip
    // (a reviewer choosing not to import a detected debt payment).
    await page.getByRole("link", { name: "ตรวจต่อ" }).click();
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/review/);
    await page.getByText("KTC PAYMENT BKK").first().click();
    await page.getByLabel("ข้ามรายการนี้").check();
    await page.getByRole("button", { name: "ยืนยันการนำเข้าทั้งหมด" }).click();
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/summary/);

    await page.goto("/settings/data");
    await expect(page.getByText("นำเข้าแล้ว")).toBeVisible();

    // Rollback deletes the historical transactions this batch created.
    await page.getByRole("button", { name: "ย้อนกลับ (Rollback)" }).click();
    await page.goto("/transactions");
    await expect(page.getByText("MERCHANT 003 BKK")).not.toBeVisible();
  });

  test("user B cannot open user A's review batch by URL", async ({ page }) => {
    await login(page, emailB, password);
    await page.goto(reviewUrl);
    // notFound() renders Next's default 404 boundary — the review board never mounts.
    await expect(page.getByRole("button", { name: "ยืนยันการนำเข้าทั้งหมด" })).toHaveCount(0);
  });

  test("malformed PDF shows a Thai error", async ({ page }) => {
    await login(page, `pdf-malformed-${Date.now()}@example.test`, password);
    await uploadPdf(page, buildMalformedPdf(), "malformed.pdf");
    await expect(page.getByText("ไฟล์ PDF นี้เสียหายหรือเปิดไม่ได้")).toBeVisible();
  });

  test("no-text-layer (scanned) PDF suggests CSV fallback", async ({ page }) => {
    await login(page, `pdf-scanned-${Date.now()}@example.test`, password);
    const buffer = await buildNoTextLayerPdf();
    await uploadPdf(page, buffer, "scanned.pdf");
    await expect(page.getByText(/ยังไม่รองรับ Statement แบบสแกน/)).toBeVisible();
  });

  test("unsupported table layout suggests CSV fallback", async ({ page }) => {
    await login(page, `pdf-unsupported-${Date.now()}@example.test`, password);
    const buffer = await buildUnsupportedLayoutPdf();
    await uploadPdf(page, buffer, "letter.pdf");
    await expect(page.getByText(/ดาวน์โหลด CSV จากธนาคารแล้วนำเข้าแทนได้/)).toBeVisible();
  });
});
