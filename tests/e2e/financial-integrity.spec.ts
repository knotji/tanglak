import { expect, test, type Page } from "@playwright/test";

const password = "password123";
const forbiddenFinancialText = /-฿0|\+฿0|฿-0|NaN|Infinity|∞|Invalid Date/;

async function signUp(page: Page, name: string) {
  const email = `financial-integrity-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  await page.context().clearCookies();
  await page.goto("/auth");
  await page.getByRole("button", { name: "สมัครใหม่" }).click();
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/(onboarding|today)$/);
  await page.goto("/onboarding?edit=1");
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill(name);
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

async function expectNoImpossibleFinancialText(page: Page) {
  await expect(page.locator("body")).not.toContainText(forbiddenFinancialText);
}

test.describe("financial integrity regression surface", () => {
  test("unbudgeted manual expense stays consistent across Today, Overview, and Budget", async ({ page }) => {
    await signUp(page, "ผู้ใช้ทดสอบ Financial Integrity");

    await page.goto("/budget");
    await page.getByLabel("รายรับต่อเดือน").fill("30000");
    await page.getByRole("button", { name: "บันทึกรายรับ" }).click();
    await expect(page.getByText("฿30,000").first()).toBeVisible();

    await page.goto("/transactions");
    await page.getByRole("button", { name: "+ เพิ่มรายการ" }).click();
    await page.getByLabel("จำนวนเงิน").fill("123.45");
    await page.getByLabel("ชื่อรายการ").fill("Financial Integrity Cafe");
    await page.getByLabel("หมวดหมู่").selectOption("อาหารและเครื่องดื่ม");
    await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
    await expect(page.getByText("Financial Integrity Cafe")).toBeVisible();

    await page.goto("/today");
    await expect(page.getByText("Financial Integrity Cafe")).toBeVisible();
    await expect(page.getByText("฿123.45").first()).toBeVisible();
    await expectNoImpossibleFinancialText(page);

    await page.goto("/overview");
    await expect(page.getByText("฿123.45").first()).toBeVisible();
    await expect(page.getByText("อาหารและเครื่องดื่ม")).toBeVisible();
    await expectNoImpossibleFinancialText(page);

    await page.goto("/budget");
    const categorySection = page.getByLabel("งบประมาณตามหมวดหมู่");
    await expect(categorySection.getByText("อาหารและเครื่องดื่ม")).toBeVisible();
    await expect(page.getByText("฿123.45").first()).toBeVisible();
    await expect(categorySection.getByText("ยังไม่ได้ตั้งงบสำหรับหมวดนี้", { exact: true })).toBeVisible();
    await expect(page.getByText("เกินงบ")).toHaveCount(0);
    await expectNoImpossibleFinancialText(page);
  });
});
