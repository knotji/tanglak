import { expect, test } from "@playwright/test";
import { acquirePipelineLock } from "./helpers/pipeline-lock";

const password = "password123";

async function createReadyUser(page: import("@playwright/test").Page) {
  const email = `guards-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  await page.context().clearCookies();
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
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ทดสอบมูลค่าเงิน");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test.describe("financial value guards", () => {
  test("manual debt creation with a negative amount is rejected and the entered value is preserved", async ({
    page,
  }) => {
    await createReadyUser(page);
    await page.goto("/debts");
    await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();
    await page.getByLabel("ชื่อหนี้").fill("Negative Debt Test");
    await page.getByLabel("ยอดเดือนนี้").fill("-1000");
    await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();

    await expect(page.getByText("จำนวนเงินต้องไม่ติดลบ")).toBeVisible();
    // Never silently repaired to a positive value or submitted anyway.
    await expect(page.getByText("Negative Debt Test")).toHaveCount(0);
    await expect(page.getByLabel("ยอดเดือนนี้")).toHaveValue("-1000");
  });

  test("manual debt creation with a valid positive amount succeeds", async ({ page }) => {
    await createReadyUser(page);
    await page.goto("/debts");
    await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();
    await page.getByLabel("ชื่อหนี้").fill("Positive Debt Test");
    await page.getByLabel("ยอดเดือนนี้").fill("2500");
    await page.getByLabel("ขั้นต่ำ").fill("500");
    await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();

    await expect(page.getByText("Positive Debt Test")).toBeVisible();
  });

  test("editing an existing debt to a negative amount is rejected and the original value is unchanged", async ({
    page,
  }) => {
    await createReadyUser(page);
    await page.goto("/debts");
    await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();
    await page.getByLabel("ชื่อหนี้").fill("Edit Guard Test");
    await page.getByLabel("ยอดเดือนนี้").fill("1000");
    await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();
    await expect(page.getByText("Edit Guard Test")).toBeVisible();

    await page.getByRole("button", { name: "แก้ไขหนี้ Edit Guard Test" }).click();
    await page.getByLabel("ยอดเดือนนี้").fill("-999");
    await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();

    await expect(page.getByText("จำนวนเงินต้องไม่ติดลบ")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Edit Guard Test")).toBeVisible();
    await expect(page.getByText("฿1,000").first()).toBeVisible();
  });

  test("adding a zero debt payment is rejected (payment must be greater than zero)", async ({ page }) => {
    await createReadyUser(page);
    await page.goto("/debts");
    await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();
    await page.getByLabel("ชื่อหนี้").fill("Payment Guard Test");
    await page.getByLabel("ยอดเดือนนี้").fill("1000");
    await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();
    await expect(page.getByText("Payment Guard Test")).toBeVisible();

    await page.getByRole("button", { name: "เพิ่มการชำระ" }).first().click();
    await page.getByLabel("ยอดที่ชำระ").fill("0");
    await page.getByRole("button", { name: "บันทึกการชำระ" }).click();

    await expect(page.getByText("จำนวนเงินต้องมากกว่า 0 บาท")).toBeVisible();
  });

  test.describe.serial("document review negative-field rejection", () => {
    let releasePipelineLock: (() => Promise<void>) | undefined;

    test.beforeAll(async () => {
      releasePipelineLock = await acquirePipelineLock();
    });

    test.afterAll(async () => {
      await releasePipelineLock?.();
    });

    test("document review with a negative amount is rejected before it reaches the server", async ({ page }) => {
      await createReadyUser(page);

      await page.goto("/upload");
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "เดลิเวอรี" }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: "delivery_grab_negative.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("mock-delivery-data"),
      });
      await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
      await expect(page).toHaveURL(/\/upload\/review\//);

      await expect(page.locator("input[name='totalPaid']")).toBeVisible();
      await page.locator("input[name='totalPaid']").fill("-195");
      await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();

      // Rejected client-side: still on the review page, entered value kept.
      await expect(page).toHaveURL(/\/upload\/review\//);
      await expect(page.getByText("จำนวนเงินต้องไม่ติดลบ")).toBeVisible();
      await expect(page.locator("input[name='totalPaid']")).toHaveValue("-195");
    });

    test("document review with a valid positive amount still confirms successfully", async ({ page }) => {
      await createReadyUser(page);

      await page.goto("/upload");
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "เดลิเวอรี" }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: "delivery_grab_positive.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("mock-delivery-data"),
      });
      await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
      await expect(page).toHaveURL(/\/upload\/review\//);

      await expect(page.locator("input[name='totalPaid']")).toHaveValue("185");
      await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();

      await expect(page).toHaveURL(/\/today/);
    });
  });
});
