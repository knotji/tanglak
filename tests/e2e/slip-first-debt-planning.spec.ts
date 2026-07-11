import { expect, test } from "@playwright/test";

const password = "password123";

async function signUp(page: import("@playwright/test").Page, name: string) {
  const email = `slip-debt-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
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
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill(name);
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test.describe("slip-first upload and debt planning pivot", () => {
  test("upload landing leads with slip upload, not bank statement import", async ({ page }) => {
    await signUp(page, "ผู้ใช้อัปโหลดสลิป");
    await page.goto("/upload");

    await expect(page.getByRole("heading", { name: "อัปโหลดสลิป" })).toBeVisible();
    await expect(page.getByText("สลิปโอนเงินออก")).toBeVisible();
    await expect(page.getByText("สลิปรับเงิน")).toBeVisible();
    await expect(page.getByText("ใบเสร็จ/ค่าอาหาร")).toBeVisible();
    await expect(page.getByText("สลิปชำระหนี้หรือบัตรเครดิต")).toBeVisible();

    // Manual entry is always available, never gated behind AI processing.
    const manualEntry = page.getByRole("link", { name: "เพิ่มรายการเอง" });
    await expect(manualEntry).toBeVisible();

    // Bank-statement import is no longer promoted from the primary upload page.
    await expect(page.getByText("Statement")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /นำเข้าประวัติย้อนหลัง/ })).toHaveCount(0);
  });

  test("manual entry link from upload navigates to transactions", async ({ page }) => {
    await signUp(page, "ผู้ใช้เพิ่มรายการเอง");
    await page.goto("/upload");
    await page.getByRole("link", { name: "เพิ่มรายการเอง" }).click();
    await expect(page).toHaveURL(/\/transactions/);
  });

  test("direct access to the legacy statement-import route shows a calm deprecation notice with three actions", async ({ page }) => {
    await signUp(page, "ผู้ใช้เข้าลิงก์เดิม");
    await page.goto("/history-import");

    await expect(page.getByText("การนำเข้ารายการจำนวนมากถูกพักไว้ชั่วคราว")).toBeVisible();
    await expect(page.getByText(/แนะนำให้อัปโหลดสลิปหรือเพิ่มรายการทีละรายการ/)).toBeVisible();
    await expect(page.getByRole("link", { name: "อัปโหลดสลิป" })).toBeVisible();
    await expect(page.getByRole("link", { name: "เพิ่มรายการเอง" })).toBeVisible();
    await expect(page.getByRole("link", { name: "กลับหน้าวันนี้" })).toBeVisible();

    // The route remains technically functional -- it is hidden/demoted,
    // not deleted -- so the underlying import UI still renders below the
    // notice for users who bookmarked this page or already have history.
    await expect(page.getByText(/นำเข้า/).first()).toBeVisible();
  });

  test("bank statement import is demoted to an advanced settings section, not the primary settings list", async ({ page }) => {
    await signUp(page, "ผู้ใช้ตั้งค่า");
    await page.goto("/settings");

    await expect(page.getByText("ขั้นสูง")).toBeVisible();
    await expect(page.getByRole("link", { name: "การนำเข้ารายการแบบเดิม" })).toBeVisible();
    await expect(page.getByText("เหมาะสำหรับข้อมูลจำนวนมากและต้องตรวจสอบหลายรายการ")).toBeVisible();
  });

  test("create a debt with outstanding balance, amount due, minimum payment, annual interest, and due date", async ({ page }) => {
    await signUp(page, "ผู้ใช้สร้างหนี้");
    await page.goto("/debts");
    await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();

    await page.getByLabel("ชื่อหนี้").fill("บัตรเครดิต ทดสอบ");
    await page.getByLabel("ยอดคงเหลือ").fill("15000");
    await page.getByLabel("ยอดเดือนนี้").fill("3000");
    await page.getByLabel("ขั้นต่ำ").fill("1500");
    await page.getByLabel("ครบกำหนด", { exact: true }).fill("2026-08-05");
    await page.getByLabel("อัตราดอกเบี้ยต่อปี (%)").fill("16.5");
    await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();

    await expect(page.getByText("บัตรเครดิต ทดสอบ")).toBeVisible();
    await expect(page.getByText(/ดอกเบี้ย 16.5% ต่อปี/)).toBeVisible();
    await expect(page.getByText(/ประมาณ.*ต่อเดือน/)).toBeVisible();
  });

  test("rejects a negative interest rate with the exact required Thai message", async ({ page }) => {
    await signUp(page, "ผู้ใช้ดอกเบี้ยติดลบ");
    await page.goto("/debts");
    await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();

    await page.getByLabel("ชื่อหนี้").fill("หนี้ทดสอบดอกเบี้ยติดลบ");
    await page.getByLabel("ยอดเดือนนี้").fill("1000");
    await page.getByLabel("ครบกำหนด", { exact: true }).fill("2026-08-05");
    await page.getByLabel("อัตราดอกเบี้ยต่อปี (%)").fill("-5");
    await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();

    await expect(page.getByText("อัตราดอกเบี้ยต้องไม่ติดลบ")).toBeVisible();
    // Entered values must be preserved, not wiped, after a validation failure.
    await expect(page.getByLabel("ชื่อหนี้")).toHaveValue("หนี้ทดสอบดอกเบี้ยติดลบ");
  });

  test("rejects an out-of-range interest rate", async ({ page }) => {
    await signUp(page, "ผู้ใช้ดอกเบี้ยเกิน");
    await page.goto("/debts");
    await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();

    await page.getByLabel("ชื่อหนี้").fill("หนี้ทดสอบดอกเบี้ยเกิน");
    await page.getByLabel("ยอดเดือนนี้").fill("1000");
    await page.getByLabel("ครบกำหนด", { exact: true }).fill("2026-08-05");
    await page.getByLabel("อัตราดอกเบี้ยต่อปี (%)").fill("150");
    await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();

    await expect(page.getByText("อัตราดอกเบี้ยไม่ถูกต้อง")).toBeVisible();
  });

  test("debts page shows a monthly obligation summary including เหลือขั้นต่ำเดือนนี้", async ({ page }) => {
    await signUp(page, "ผู้ใช้สรุปหนี้เดือนนี้");
    await page.goto("/debts");
    await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();
    await page.getByLabel("ชื่อหนี้").fill("หนี้สรุปเดือนนี้");
    await page.getByLabel("ยอดเดือนนี้").fill("2000");
    await page.getByLabel("ขั้นต่ำ").fill("500");
    await page.getByLabel("ครบกำหนด", { exact: true }).fill("2026-08-05");
    await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();

    await expect(page.getByText("ต้องจ่ายเดือนนี้")).toBeVisible();
    await expect(page.getByText("เหลือขั้นต่ำเดือนนี้")).toBeVisible();
  });

  for (const width of [360, 390, 430]) {
    test(`no horizontal overflow at ${width}px on upload and debts pages`, async ({ page }) => {
      await signUp(page, `ผู้ใช้จอ ${width}`);
      await page.setViewportSize({ width, height: 844 });

      for (const route of ["/upload", "/debts", "/history-import"]) {
        await page.goto(route);
        const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(hasOverflow, `${route} overflowed at ${width}px`).toBe(false);
      }
    });
  }
});
