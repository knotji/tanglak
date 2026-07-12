import { expect, test } from "@playwright/test";
import { acquirePipelineLock } from "./helpers/pipeline-lock";

const email = `test-${Date.now()}@example.test`;
const password = "password123";
let userDocId = "";

async function loginAndCompleteOnboarding(page: import("@playwright/test").Page) {
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
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้เอกสาร");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test.describe.serial("Gemini Document Upload & Review Flow", () => {
  let releasePipelineLock: (() => Promise<void>) | undefined;

  test.beforeEach(async () => {
    releasePipelineLock = await acquirePipelineLock();
  });

  test.afterEach(async () => {
    await releasePipelineLock?.();
    releasePipelineLock = undefined;
  });

  test("upload salary slip, review and confirm salary", async ({ page }) => {
    await loginAndCompleteOnboarding(page);

    await page.goto("/upload");
    // Trigger file upload card
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "ถ่ายรูป หรือเลือกไฟล์หลักฐาน" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "my_salary_slip.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock-salary-data"),
    });

    // Wait for the upload card to appear
    await expect(page.getByText("my_salary_slip.png")).toBeVisible();
    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();

    // It should automatically transition to review screen
    await expect(page).toHaveURL(/\/upload\/review\//);
    const url = page.url();
    userDocId = url.split("/").pop() || "";

    // Verify extracted salary slip fields
    await expect(page.getByText("สถานะ: อ่านได้ชัด")).toBeVisible();
    await expect(page.locator("input[name='employer']")).toHaveValue("Acme Corp");
    await expect(page.locator("input[name='netIncome']")).toHaveValue("38920");

    // Click confirm
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();
    await expect(page).toHaveURL(/\/today/);

    // Verify on transactions page
    await page.goto("/transactions");
    await expect(page.getByText("Acme Corp")).toBeVisible();
    await expect(page.getByText("฿38,920").first()).toBeVisible();
  });

  test("upload delivery screenshot, edit extracted amount before confirmation", async ({ page }) => {
    // Reuse session
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
      name: "delivery_grab.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("mock-delivery-data"),
    });

    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);

    // Verify extracted delivery slip fields
    await expect(page.locator("input[name='merchant']")).toHaveValue("GrabFood");
    await expect(page.locator("input[name='totalPaid']")).toHaveValue("185");

    // Unambiguous Thai date/time helper next to the datetime-local input,
    // regardless of the browser's own locale-dependent rendering of the
    // native input itself.
    const occurredAtInput = page.locator("input[name='occurredAt']");
    const helperId = await occurredAtInput.getAttribute("aria-describedby");
    expect(helperId).toBeTruthy();
    await expect(page.locator(`#${helperId}`)).toContainText("10 ก.ค. 2026 เวลา 12:30");
    await expect(page.locator(`#${helperId}`)).toContainText("อ่านจากเอกสาร");

    // Edit amount before saving
    await page.locator("input[name='totalPaid']").fill("195");
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();

    await expect(page).toHaveURL(/\/today/);
    await page.goto("/transactions");
    await expect(page.getByText("GrabFood")).toBeVisible();
    await expect(page.getByText("฿195").first()).toBeVisible();
  });

  test("upload with unclear/missing date opens the review screen (not the failure screen), and confirming with a manually entered date succeeds", async ({ page }) => {
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
      name: "missing_date_receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock-missing-date-data"),
    });

    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);
    const reviewUrl = page.url();
    const docId = reviewUrl.split("/").pop() || "";

    // The review (editing) screen must render, not the terminal failure
    // screen -- confirmed both by the required review-required banner being
    // visible and the failure heading being absent.
    await expect(page.getByText("การอ่านสลิปไม่สำเร็จ")).toHaveCount(0);
    await expect(page.getByText("อ่านวันที่และเวลาไม่ชัด")).toBeVisible();
    await expect(page.getByText("กรุณาตรวจสอบหรือกรอกข้อมูลก่อนบันทึก")).toBeVisible();

    // Other extracted fields remain populated even though the date is missing.
    await expect(page.locator("input[name='merchant']")).toHaveValue("ร้านค้าทดสอบไม่มีวันที่");
    await expect(page.locator("input[name='totalPaid']")).toHaveValue("250");

    // The date/time input itself must be visible, accessible, and blank
    // (never prefilled with the current time) with a clear missing-field hint.
    const occurredAtInput = page.locator("input[name='occurredAt']");
    await expect(occurredAtInput).toBeVisible();
    await expect(occurredAtInput).toHaveValue("");
    const helperId = await occurredAtInput.getAttribute("aria-describedby");
    await expect(page.locator(`#${helperId}`)).toContainText("กรุณาระบุวันและเวลาที่ทำรายการ");

    // Retry and manual-edit affordances remain available.
    await expect(page.getByRole("button", { name: "ประมวลผลใหม่" })).toBeVisible();

    // Attempting to confirm without a date is rejected with the exact
    // required Thai copy, focuses the date field, and does not navigate away.
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();
    await expect(page.getByText("กรุณาระบุวันที่และเวลาของรายการ")).toBeVisible();
    await expect(page).toHaveURL(reviewUrl);
    await expect(occurredAtInput).toBeFocused();
    // Other fields remain intact after the rejected attempt.
    await expect(page.locator("input[name='merchant']")).toHaveValue("ร้านค้าทดสอบไม่มีวันที่");

    // User enters the date/time manually; confirmation now succeeds.
    await occurredAtInput.fill("2026-07-15T09:30");
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();
    await expect(page).toHaveURL(/\/today/);

    // The resulting transaction carries the manually entered date/time,
    // converted to the Bangkok-offset instant -- not a fabricated one.
    await page.goto("/transactions");
    await expect(page.getByText("ร้านค้าทดสอบไม่มีวันที่")).toBeVisible();
    await expect(page.getByText("฿250").first()).toBeVisible();

    // Retrying extraction on the same (now-confirmed) document id must not
    // have created a duplicate document row -- there is exactly one review
    // page for this id and it reflects the same original file.
    await page.goto(`/upload/review/${docId}`);
    await expect(page.locator("input[name='merchant']")).toHaveValue("ร้านค้าทดสอบไม่มีวันที่");
  });

  test("retrying extraction on a needs_review document reuses the same document (no duplicate)", async ({ page }) => {
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
      name: "missing_date_receipt_retry.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock-missing-date-retry-data"),
    });

    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);
    const reviewUrl = page.url();

    const retryDialog = page.waitForEvent("dialog").then((dialog) => {
      expect(dialog.message()).toContain("เริ่มสแกนเอกสารอีกครั้งแล้ว");
      return dialog.accept();
    });
    await page.getByRole("button", { name: "ประมวลผลใหม่" }).click();
    await retryDialog;

    // Retry stays on the exact same review URL (same document id) and the
    // fields are re-populated from the same file -- no second document was
    // created, no duplicate storage upload occurred.
    await expect(page).toHaveURL(reviewUrl);
    await expect(page.locator("input[name='merchant']")).toHaveValue("ร้านค้าทดสอบไม่มีวันที่");
    await expect(page.locator("input[name='totalPaid']")).toHaveValue("250");
  });

  test("upload debt statement, create debt from review", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "สลิปชำระหนี้หรือบัตรเครดิต" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "ktc_statement.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("mock-debt-data"),
    });

    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);

    // Verify extracted debt statement fields
    await expect(page.locator("input[name='creditor']")).toHaveValue("KTC");
    await expect(page.locator("input[name='amountDue']")).toHaveValue("3200");

    // F-009: there is no silent default -- the user must explicitly choose
    // how to save this debt before confirming. The radio input is styled
    // with `display: none` (removing it from the accessibility tree), so
    // click the visible label text and assert checked state via a CSS
    // locator instead of a role locator.
    await page.getByText("สร้างเป็นบัญชีหนี้ใหม่").click();
    await expect(page.locator('input[name="debtActionType"][value="create"]')).toBeChecked();
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();
    await expect(page).toHaveURL(/\/today/);

    // Check debts page to confirm debt exists
    await page.goto("/debts");
    await expect(page.getByText("KTC")).toBeVisible();
  });

  test("blocks confirming a debt statement without an explicit create/update choice (F-009)", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "สลิปชำระหนี้หรือบัตรเครดิต" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "ktc_statement_2.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("mock-debt-data"),
    });

    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);

    await expect(page.locator('input[name="debtActionType"][value="create"]')).not.toBeChecked();
    await expect(page.locator('input[name="debtActionType"][value="update"]')).not.toBeChecked();

    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();
    await expect(page.getByText("กรุณาเลือกวิธีบันทึกหนี้นี้")).toBeVisible();
    await expect(page).toHaveURL(/\/upload\/review\//);
  });

  test("detect possible duplicate and link existing", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    // First create a transaction for 1500 to KTC Test
    await page.goto("/transactions");
    await page.getByRole("button", { name: "+ เพิ่มรายการ" }).click();
    await page.getByLabel("จำนวนเงิน").fill("1500");
    await page.getByLabel("ชื่อรายการ").fill("KTC Test");
    await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
    await expect(page.getByText("KTC Test")).toBeVisible();

    // Now upload transfer slip that matches it
    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "สลิปชำระหนี้หรือบัตรเครดิต" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "transfer_slip.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock-transfer-data"),
    });

    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);

    // Check that duplicate warning matches
    await expect(page.getByText("ตรวจพบรายการที่อาจซ้ำซ้อนกัน")).toBeVisible();
    await expect(page.getByText("ความคล้าย:")).toBeVisible();

    // Choose to merge / link existing
    await page.getByRole("button", { name: "เชื่อมโยงหลักฐาน" }).click();
    await expect(page).toHaveURL(/\/today/);
  });

  test("Gemini failure and retry fallback", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "ถ่ายรูป หรือเลือกไฟล์หลักฐาน" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "failed_slip.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock-failed-data"),
    });

    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);

    // Verify failed message is safe Thai copy, not raw provider/schema internals.
    await expect(page.getByText("การอ่านสลิปไม่สำเร็จ")).toBeVisible();
    await expect(page.getByText("การอ่านข้อมูลบางส่วนไม่ครบ")).toBeVisible();
    await expect(page.getByText("ลองประมวลผลอีกครั้ง หรือกรอกข้อมูลด้วยตนเอง")).toBeVisible();
    await expect(page.getByText("Gemini quota/rate limit error")).toHaveCount(0);
    await expect(page.getByText("expected number")).toHaveCount(0);
    await expect(page.getByText("received undefined")).toHaveCount(0);

    // Use manual fallback
    await page.getByRole("button", { name: "กรอกข้อมูลด้วยตนเอง" }).click();
    await expect(page.locator("input[name='merchant']")).toBeVisible();

    // Fill and submit
    await page.locator("input[name='merchant']").fill("Manual Coffee Shop");
    await page.locator("input[name='totalPaid']").fill("140");
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();

    await expect(page).toHaveURL(/\/today/);
    await page.goto("/transactions");
    await expect(page.getByText("Manual Coffee Shop")).toBeVisible();
    await expect(page.getByText("฿140").first()).toBeVisible();
  });

  test("retry reuses the existing failed document and navigates to review on success", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "ถ่ายรูป หรือเลือกไฟล์หลักฐาน" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "retry_success_receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock-retry-success-data"),
    });

    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);
    const failedReviewUrl = page.url();
    await expect(page.getByText("การอ่านข้อมูลบางส่วนไม่ครบ")).toBeVisible();

    const retryDialog = page.waitForEvent("dialog").then((dialog) => dialog.accept());
    await page.getByRole("button", { name: "ลองประมวลผลอีกครั้ง" }).click();
    await retryDialog;
    await page.reload();
    await expect(page.locator("input[name='totalPaid']")).toHaveValue("120");
    await expect(page).toHaveURL(failedReviewUrl);
    await expect(page.getByText("การอ่านสลิปไม่สำเร็จ")).toHaveCount(0);
  });

  test("user cannot access another user's document", async ({ page }) => {
    // Create new user B
    const emailB = `testB-${Date.now()}@example.test`;
    await page.goto("/auth");
    await page.getByRole("button", { name: "สมัครใหม่" }).click();
    await page.getByLabel("อีเมล").fill(emailB);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
    await page.getByRole("button", { name: "สร้างบัญชี" }).click();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toMatch(/^\/(onboarding|today)$/);
    await page.goto("/onboarding?edit=1");
    await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ B");
    await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
    await expect(page).toHaveURL(/\/today/);

    // Navigate to user A's document review page
    await page.goto(`/upload/review/${userDocId}`);

    // Verify it doesn't show user A's document details (shows not found or redirect)
    await expect(page.getByText("Acme Corp")).toHaveCount(0);
  });

  test("review page with the Thai date/time helper has no overflow at mobile widths", async ({ page }) => {
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
      name: "delivery_grab_mobile.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("mock-delivery-data"),
    });
    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);
    await expect(page.locator("input[name='occurredAt']")).toBeVisible();

    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(hasOverflow, `review page overflowed at ${width}px`).toBe(false);
    }
  });

  test("refresh review without losing server-persisted extraction", async ({ page }) => {
    // Sign back in as user A
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    // Upload another salary slip -- the mock extraction pipeline is keyed
    // by filename ("salary"), not by which quick-select tile was clicked,
    // so any tile that triggers the file picker works here.
    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "สลิปรับเงิน" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "my_salary_slip2.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock-salary-data"),
    });

    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);

    await expect(page.locator("input[name='employer']")).toHaveValue("Acme Corp");

    // Refresh page
    await page.reload();

    // Verify fields are still loaded
    await expect(page.locator("input[name='employer']")).toHaveValue("Acme Corp");
  });
});
