import { expect, test } from "@playwright/test";

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

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้เอกสาร");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test.describe.serial("Gemini Document Upload & Review Flow", () => {
  test.beforeAll(async ({}) => {
    // Shared setup if needed
  });

  test("upload salary slip, review and confirm salary", async ({ page }) => {
    await loginAndCompleteOnboarding(page);

    await page.goto("/upload");
    // Trigger file upload card
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("section:has-text('ถ่ายรูป หรือเลือกไฟล์')").click();
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
    await page.getByRole("button", { name: "เดลิเวอรี" }).click();
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

    // Edit amount before saving
    await page.locator("input[name='totalPaid']").fill("195");
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();

    await expect(page).toHaveURL(/\/today/);
    await page.goto("/transactions");
    await expect(page.getByText("GrabFood")).toBeVisible();
    await expect(page.getByText("฿195").first()).toBeVisible();
  });

  test("upload debt statement, create debt from review", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "ใบแจ้งหนี้" }).click();
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

    // Verify default choice is "สร้างเป็นบัญชีหนี้ใหม่"
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();
    await expect(page).toHaveURL(/\/today/);

    // Check debts page to confirm debt exists
    await page.goto("/debts");
    await expect(page.getByText("KTC")).toBeVisible();
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
    await page.getByRole("button", { name: "ชำระหนี้" }).click();
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
    await page.locator("section:has-text('ถ่ายรูป หรือเลือกไฟล์')").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "failed_slip.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock-failed-data"),
    });

    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);

    // Verify failed message
    await expect(page.getByText("การอ่านสลิปไม่สำเร็จ")).toBeVisible();
    await expect(page.getByText("Gemini quota/rate limit error")).toBeVisible();

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

  test("user cannot access another user's document", async ({ page }) => {
    // Create new user B
    const emailB = `testB-${Date.now()}@example.test`;
    await page.goto("/auth");
    await page.getByRole("button", { name: "สมัครใหม่" }).click();
    await page.getByLabel("อีเมล").fill(emailB);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
    await page.getByRole("button", { name: "สร้างบัญชี" }).click();
    await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ B");
    await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
    await expect(page).toHaveURL(/\/today/);

    // Navigate to user A's document review page
    await page.goto(`/upload/review/${userDocId}`);

    // Verify it doesn't show user A's document details (shows not found or redirect)
    await expect(page.getByText("Acme Corp")).toHaveCount(0);
  });

  test("refresh review without losing server-persisted extraction", async ({ page }) => {
    // Sign back in as user A
    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    // Upload another salary slip
    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "เงินเดือน" }).click();
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
