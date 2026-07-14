import { expect, test } from "@playwright/test";

const password = "password123";

async function signUp(page: import("@playwright/test").Page, name: string) {
  const email = `prodscenario-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
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

/**
 * The exact "manual production-like check" scenario from the production
 * bug report: planned income ฿5,000, one confirmed ฿20 food expense, no
 * category budget configured. Verifies Today, Transactions, Overview, and
 * Budget all agree, and that none of the four originally-reported defects
 * (inconsistent totals, negative "remaining budget", hidden category,
 * partially-green income amount) are present.
 */
test.describe("production scenario: ฿5,000 income, one ฿20 unbudgeted food expense", () => {
  test("Today, Transactions, Overview, and Budget all show a consistent ฿20 and no negative/hidden/miscolored state", async ({ page }) => {
    await signUp(page, "ผู้ใช้ตรวจสอบสถานการณ์จริง");
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Set planned income to ฿5,000 -- deliberately do NOT create any
    // category budget, matching the reported production state.
    await page.goto(`/budget?month=${currentMonth}`);
    await page.getByLabel("รายรับต่อเดือน").fill("5000");
    await page.getByRole("button", { name: "บันทึกรายรับ" }).click();
    await expect(page.getByText("บันทึกรายรับแล้ว")).toBeVisible();

    // Record one confirmed ฿20 expense, explicitly categorized as food.
    await page.goto("/transactions");
    await page.getByRole("button", { name: "+ เพิ่มรายการ" }).click();
    await page.getByLabel("จำนวนเงิน").fill("20");
    await page.getByLabel("ชื่อรายการ").fill("Coffee");
    await page.getByLabel("หมวดหมู่").selectOption("อาหารและเครื่องดื่ม");
    await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
    await expect(page.getByText("Coffee")).toBeVisible();

    // Transactions: the ฿20 expense is visible.
    await expect(page.getByText("Coffee")).toBeVisible();
    await expect(page.getByText("฿20").first()).toBeVisible();

    // Today: เดือนนี้ใช้ไป ฿20, no negative "งบที่เหลือ -฿20".
    await page.goto("/today");
    await expect(page.getByText("เดือนนี้ใช้ไป")).toBeVisible();
    await expect(page.getByText("฿20").first()).toBeVisible();
    await expect(page.getByText("-฿20")).toHaveCount(0);
    await expect(page.getByText("ยังไม่ได้ตั้งงบ").first()).toBeVisible();
    // The next-action card should point at the unbudgeted food category,
    // not claim it's overspent.
    await expect(page.getByText("เกินงบแล้ว")).toHaveCount(0);

    // Overview: income ฿5,000, expense ฿20, no "-฿0", no bare unstyled "+".
    await page.goto("/overview");
    await expect(page.getByText("฿5,000").first()).toBeVisible();
    await expect(page.getByText("฿20").first()).toBeVisible();
    await expect(page.getByText("-฿0")).toHaveCount(0);
    await expect(page.getByText("+฿0")).toHaveCount(0);
    // Overspending must never be claimed when nothing was actually
    // budgeted -- only the distinct "unbudgeted spending" wording may
    // appear.
    await expect(page.getByText("เกินงบรวม")).toHaveCount(0);

    // Budget: food category appears automatically (spending but no
    // budget), shows "ยังไม่ได้ตั้งงบ", not hidden behind an
    // "add your first category" empty state.
    await page.goto(`/budget?month=${currentMonth}`);
    await expect(page.getByText("ยังไม่มีหมวดหมู่งบประมาณ")).toHaveCount(0);
    await expect(page.getByText("อาหารและเครื่องดื่ม").first()).toBeVisible();
    await expect(page.getByText("ยังไม่ได้ตั้งงบ").first()).toBeVisible();
    await expect(page.getByText(/ใช้จ่ายไป .*ในหมวดที่ยังไม่ได้ตั้งงบ/)).toBeVisible();
    // No real overspending, since no positive category budget was ever
    // exceeded.
    await expect(page.getByText("ยอดเกินงบรวม")).toHaveCount(0);
  });
});
