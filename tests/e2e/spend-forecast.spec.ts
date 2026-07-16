import { expect, test, type Page } from "@playwright/test";

const password = "password123";
const currentMonth = "2026-07";
const todayDateTime = "2026-07-15T09:30";

async function signUp(page: Page, name: string) {
  const email = `spend-forecast-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
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

async function createFoodBudget(page: Page, budgetBaht: string) {
  await page.goto(`/budget?month=${currentMonth}`);
  await page.getByLabel("รายรับต่อเดือน").fill("30000");
  await page.getByRole("button", { name: "บันทึกรายรับ" }).click();
  await expect(page.getByText("บันทึกรายรับแล้ว")).toBeVisible();
  await page.getByLabel("ชื่อหมวดหมู่ใหม่").selectOption("อาหารและเครื่องดื่ม");
  await page.getByLabel("งบประมาณหมวดหมู่ใหม่").fill(budgetBaht);
  await page.getByRole("button", { name: "+ เพิ่มหมวดหมู่งบประมาณ" }).click();
  await expect(page.getByText("อาหาร")).toBeVisible();
}

async function createFoodExpense(page: Page, merchant: string, amountBaht: string) {
  await page.goto(`/transactions?month=${currentMonth}`);
  await page.getByRole("button", { name: "+ เพิ่มรายการ" }).click();
  await page.getByLabel("จำนวนเงิน").fill(amountBaht);
  await page.getByLabel("ชื่อรายการ").fill(merchant);
  await page.locator('input[name="date"]').fill(todayDateTime);
  await page.getByLabel("หมวดหมู่").selectOption("อาหารและเครื่องดื่ม");
  await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
  await expect(page.getByText(merchant)).toBeVisible();
}

test.describe("burn-rate spend forecast", () => {
  test("Today warns when recent spend projects over budget without changing saved finance data", async ({ page }) => {
    const merchant = "Forecast Hotpot";
    await signUp(page, "ผู้ใช้คาดการณ์งบ");
    await createFoodBudget(page, "5000");
    await createFoodExpense(page, merchant, "4900");

    await page.goto("/today");
    await expect(page.getByText("ใช้ได้อีกวันละ")).toBeVisible();
    const forecastCard = page.getByRole("status", { name: "ระวังงบหมดก่อนสิ้นเดือน" });
    await expect(forecastCard).toBeVisible();
    await expect(forecastCard).toContainText("จากการใช้จ่ายช่วง 7 วันที่ผ่านมา");
    await expect(forecastCard).toContainText("คาดว่าจะใช้เพิ่มอีกประมาณ");
    await expect(forecastCard).toContainText("อาจเกินงบประมาณ");
    await expect(forecastCard).toContainText("เป็นการประมาณจากพฤติกรรมล่าสุด ยอดจริงอาจเปลี่ยนได้");
    await expect(forecastCard.getByRole("link", { name: "ดูและปรับงบ" })).toHaveAttribute("href", "/budget");

    await page.reload();
    await expect(page.getByRole("status", { name: "ระวังงบหมดก่อนสิ้นเดือน" })).toBeVisible();
    await page.goto(`/transactions?month=${currentMonth}`);
    await expect(page.getByText(merchant)).toHaveCount(1);

    await page.goto(`/budget?month=${currentMonth}`);
    await expect(page.getByText(/ใช้ไป .*฿4,900.* จาก .*฿5,000/)).toBeVisible();
  });

  test("Today stays quiet when the projected month-end spend remains within budget", async ({ page }) => {
    await signUp(page, "ผู้ใช้งบยังพอ");
    await createFoodBudget(page, "5000");
    await createFoodExpense(page, "Forecast Snack", "100");

    await page.goto("/today");
    await expect(page.getByRole("status", { name: "ระวังงบหมดก่อนสิ้นเดือน" })).toHaveCount(0);
    await expect(page.getByText("ใช้ได้อีกวันละ")).toBeVisible();
  });
});
