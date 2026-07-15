import { expect, test } from "@playwright/test";

const password = "password123";

async function createReadyUser(page: import("@playwright/test").Page) {
  const email = `nav-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
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
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ทดสอบนำทาง");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByRole("heading", { name: "วันนี้", exact: true })).toBeVisible();
}

test.describe("BottomNavigation active-state matching", () => {
  test("exact matches root navigation routes correctly", async ({ page }) => {
    await createReadyUser(page);

    // 1. Visit /today, verify "วันนี้" tab is active, others are not
    await page.goto("/today");
    const todayLink = page.getByRole("link", { name: "วันนี้", exact: true });
    await expect(todayLink).toHaveAttribute("aria-current", "page");

    const debtsLink = page.getByRole("link", { name: "หนี้", exact: true });
    await expect(debtsLink).not.toHaveAttribute("aria-current", "page");
  });

  test("maintains active state under query parameters and hash changes", async ({ page }) => {
    await createReadyUser(page);

    // 1. Visit budget with query param, verify "งบ" tab is active
    await page.goto("/budget?month=2026-07");
    const budgetLink = page.getByRole("link", { name: "งบ", exact: true });
    await expect(budgetLink).toHaveAttribute("aria-current", "page");

    // 2. Visit debts with hash, verify "หนี้" tab is active
    await page.goto("/debts#some-hash");
    const debtsLink = page.getByRole("link", { name: "หนี้", exact: true });
    await expect(debtsLink).toHaveAttribute("aria-current", "page");
  });

  test("keeps parent tab active when visiting nested routes", async ({ page }) => {
    await createReadyUser(page);

    // 1. Go to debts page and create a test debt
    await page.goto("/debts");
    await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();
    await page.getByLabel("ชื่อหนี้").fill("หนี้นำทาง E2E");
    await page.getByLabel("ยอดคงเหลือ").fill("5000");
    await page.getByLabel("ยอดเดือนนี้").fill("1000");
    await page.getByLabel("ขั้นต่ำ").fill("1000");
    await page.getByLabel("อัตราดอกเบี้ยต่อปี (%)").fill("15");
    await page.getByLabel("ครบกำหนด", { exact: true }).fill("2026-08-19");
    await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();

    const card = page.locator("article", { hasText: "หนี้นำทาง E2E" });
    await expect(card).toBeVisible();

    // 2. Click "ดูรายละเอียด" to go to /debts/[debtId] nested route
    await card.getByRole("link", { name: "ดูรายละเอียด" }).click();
    await expect(page).toHaveURL(/\/debts\/[a-f0-9-]+$/);

    // 3. Verify "หนี้" tab remains active, others do not
    const debtsLink = page.getByRole("link", { name: "หนี้", exact: true });
    await expect(debtsLink).toHaveAttribute("aria-current", "page");

    const todayLink = page.getByRole("link", { name: "วันนี้", exact: true });
    await expect(todayLink).not.toHaveAttribute("aria-current", "page");

    // 4. Navigate to simulate route /debts/[debtId]/simulate
    const detailUrl = page.url();
    await page.goto(`${detailUrl}/simulate`);
    await expect(page).toHaveURL(/\/debts\/[a-f0-9-]+\/simulate/);

    // 5. Verify "หนี้" tab remains active on simulate sub-route
    await expect(debtsLink).toHaveAttribute("aria-current", "page");
  });
});
