import { expect, test } from "@playwright/test";

const password = "password123";

async function signUpAndCompleteOnboarding(page: import("@playwright/test").Page) {
  const email = `debt-strategy-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  await page.goto("/auth");
  await page.getByRole("button", { name: "สมัครใหม่" }).click();
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/(onboarding|today)$/);
  await page.goto("/onboarding?edit=1");
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้แผนหนี้");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

async function createDebt(
  page: import("@playwright/test").Page,
  input: {
    name: string;
    outstanding: string;
    amountDue: string;
    minimum: string;
    interestRateAnnual: string;
    dueDate: string;
  },
) {
  await page.goto("/debts");
  await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();
  await page.getByLabel("ชื่อหนี้").fill(input.name);
  await page.getByLabel("ยอดคงเหลือ").fill(input.outstanding);
  await page.getByLabel("ยอดเดือนนี้").fill(input.amountDue);
  await page.getByLabel("ขั้นต่ำ").fill(input.minimum);
  await page.getByLabel("ครบกำหนด", { exact: true }).fill(input.dueDate);
  await page.getByLabel("อัตราดอกเบี้ยต่อปี (%)").fill(input.interestRateAnnual);
  await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();
  await expect(page.getByText(input.name)).toBeVisible();
}

test("debt portfolio strategy compares snowball and avalanche without writing financial data", async ({ page }) => {
  await signUpAndCompleteOnboarding(page);
  await createDebt(page, {
    name: "บัตรยอดเล็ก",
    outstanding: "5000",
    amountDue: "500",
    minimum: "500",
    interestRateAnnual: "8",
    dueDate: "2026-08-20",
  });
  await createDebt(page, {
    name: "สินเชื่อดอกสูง",
    outstanding: "20000",
    amountDue: "1000",
    minimum: "1000",
    interestRateAnnual: "30",
    dueDate: "2026-08-25",
  });

  await page.goto("/debts/strategy");
  await expect(page.getByRole("heading", { name: "วางแผนปิดหนี้" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /ปิดก้อนเล็กก่อน/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /ลดดอกเบี้ยก่อน/ })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("คำแนะนำ")).toBeVisible();
  const debtOrder = page.getByLabel("ลำดับหนี้");
  await expect(debtOrder.getByRole("heading", { name: "บัตรยอดเล็ก" })).toBeVisible();
  await expect(debtOrder.getByRole("heading", { name: "สินเชื่อดอกสูง" })).toBeVisible();
  await expect(page.getByLabel("เมนูหลัก").getByRole("link", { name: "หนี้" })).toHaveAttribute("aria-current", "page");

  const comparison = page.getByLabel("เปรียบเทียบดอกเบี้ยรวม");
  const beforeComparisonText = await comparison.textContent();
  await page.getByRole("textbox", { name: "งบโปะเพิ่มต่อเดือน" }).fill("2000");
  await expect(page.getByText("คำนวณด้วยเงินโปะเพิ่ม ฿2,000 ต่อเดือน")).toBeVisible();
  await expect.poll(() => comparison.textContent()).not.toBe(beforeComparisonText);

  await page.getByRole("radio", { name: /ลดดอกเบี้ยก่อน/ }).click();
  await expect(page.getByRole("radio", { name: /ลดดอกเบี้ยก่อน/ })).toHaveAttribute("aria-checked", "true");
  const orderedDebtText = await debtOrder.textContent();
  expect(orderedDebtText?.indexOf("สินเชื่อดอกสูง")).toBeLessThan(orderedDebtText?.indexOf("บัตรยอดเล็ก") ?? Number.MAX_SAFE_INTEGER);

  await page.getByRole("textbox", { name: "งบโปะเพิ่มต่อเดือน" }).fill("-1");
  await expect(page.getByRole("region", { name: "งบโปะเพิ่มต่อเดือน" }).getByRole("alert")).toContainText("จำนวนเงินต้องไม่ติดลบ");

  await page.goto("/debts");
  await page.getByRole("link", { name: "ประวัติหนี้ บัตรยอดเล็ก" }).click();
  await expect(page.getByText("ยังไม่มีประวัติการชำระ")).toBeVisible();
});

test("debt strategy page explains when fewer than two active debts exist", async ({ page }) => {
  await signUpAndCompleteOnboarding(page);
  await createDebt(page, {
    name: "หนี้เดี่ยว",
    outstanding: "5000",
    amountDue: "500",
    minimum: "500",
    interestRateAnnual: "10",
    dueDate: "2026-08-20",
  });

  await page.goto("/debts/strategy");
  await expect(page.getByRole("heading", { name: "ต้องมีหนี้ที่ยัง active อย่างน้อย 2 ก้อน" })).toBeVisible();
  await expect(page.getByRole("link", { name: "กลับไปหน้าหนี้" })).toHaveAttribute("href", "/debts");
});
