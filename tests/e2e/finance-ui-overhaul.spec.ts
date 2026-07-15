import { expect, test } from "@playwright/test";

const password = "password123";

async function signUp(page: import("@playwright/test").Page, name: string) {
  const email = `overhaul-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;

  // Register page error & console error diagnostics
  page.on("pageerror", (err) => {
    console.error(`[Page Error] ${err.stack || err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[Console Error] ${msg.text()}`);
    }
  });

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

  // Wait for onboarding submission to process and redirect to today
  await expect(page).toHaveURL(/\/today/);

  // Wait for the Today page to be fully loaded and rendered deterministically
  await expect(page.getByRole("heading", { name: "วันนี้", exact: true })).toBeVisible();
}

test.describe("finance UI overhaul", () => {
  test("bottom navigation routes to the Budget page and marks it active", async ({ page }) => {
    await signUp(page, "ผู้ใช้เมนูงบ");
    await page.goto("/today");

    // Wait for the navigation to be ready
    const budgetLink = page.getByRole("link", { name: "งบ", exact: true });
    await expect(budgetLink).toBeVisible();

    // Use Promise.all to prevent Next.js navigation race condition
    await Promise.all([
      page.waitForURL(/\/budget/),
      budgetLink.click(),
    ]);

    // Ensure we did not redirect back to auth or onboarding
    await expect(page).toHaveURL(/\/budget/);
    const finalUrl = page.url();
    expect(finalUrl).not.toContain("/auth");
    expect(finalUrl).not.toContain("/onboarding");

    // Verify accessible heading is visible
    const budgetPage = page.locator("main", { has: page.getByRole("heading", { name: "งบประมาณรายเดือน" }) });
    await expect(budgetPage).toBeVisible({ timeout: 15_000 });

    // Verify the link has the correct aria-current attribute
    await expect(page.getByRole("link", { name: "งบ", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("today dashboard shows a meaningful zero-spend state instead of a shouting ฿0.00", async ({ page }) => {
    await signUp(page, "ผู้ใช้วันนี้ว่าง");
    await page.goto("/today");

    await expect(page.getByText("วันนี้ใช้ไป")).toBeVisible();
    await expect(page.getByText("ยังไม่มีรายจ่ายวันนี้")).toBeVisible();
    await expect(page.getByText("฿0.00")).toHaveCount(0);
  });

  test("today dashboard shows daily context (days remaining)", async ({ page }) => {
    await signUp(page, "ผู้ใช้ดูวันเหลือ");
    await page.goto("/today");

    await expect(page.getByText("เหลืออีก")).toBeVisible();
    await expect(page.getByText(/วัน$/)).toBeVisible();
  });

  test("today dashboard offers a scan/upload action reachable without the bottom nav", async ({ page }) => {
    await signUp(page, "ผู้ใช้สแกน");
    await page.goto("/today");

    const scanLink = page.getByRole("link", { name: /สแกน\/อัปโหลด/ });
    await expect(scanLink).toBeVisible();
    await scanLink.click();
    await expect(page).toHaveURL(/\/upload/);
  });

  test("overview leads with the disposable-amount question, not a generic metric grid", async ({ page }) => {
    await signUp(page, "ผู้ใช้ภาพรวม");
    await page.goto("/overview");

    await expect(page.getByText("เหลือใช้จริงเดือนนี้")).toBeVisible();
    await expect(page.getByText("สถานะงบประมาณ")).toBeVisible();
  });

  test("overview hides debt section when there is no debt", async ({ page }) => {
    await signUp(page, "ผู้ใช้ไม่มีหนี้");
    await page.goto("/overview");

    await expect(page.getByText("ภาระหนี้")).not.toBeVisible();
  });

  test("budget month selector supports previous, next, and return-to-current-month controls", async ({ page }) => {
    await signUp(page, "ผู้ใช้เลือกเดือนงบ");
    await page.goto("/budget?month=2026-05");

    await expect(page.getByRole("button", { name: "เดือนก่อนหน้า" })).toBeVisible();
    await expect(page.getByRole("button", { name: "เดือนถัดไป" })).toBeVisible();
    await expect(page.getByRole("button", { name: "กลับไปเดือนนี้" })).toBeVisible();
    await expect(page.getByText("เดือนที่ผ่านมา")).toBeVisible();

    await page.getByRole("button", { name: "กลับไปเดือนนี้" }).click();
    await expect(page).not.toHaveURL(/month=2026-05/);
  });
});
