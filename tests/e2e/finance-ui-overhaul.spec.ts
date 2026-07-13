import { expect, test } from "@playwright/test";

const password = "password123";

async function signUp(page: import("@playwright/test").Page, name: string) {
  const email = `overhaul-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
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

test.describe("finance UI overhaul", () => {
  test("bottom navigation routes to the Budget page and marks it active", async ({ page }) => {
    await signUp(page, "ผู้ใช้เมนูงบ");
    await page.goto("/today");

    const budgetLink = page.getByRole("link", { name: "งบ", exact: true });
    await expect(budgetLink).toBeVisible();
    await budgetLink.click();

    await expect(page).toHaveURL(/\/budget/);
    const budgetPage = page.locator("main", { has: page.getByRole("heading", { name: "งบประมาณรายเดือน" }) });
    await expect(budgetPage).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "งบ", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("today dashboard shows a meaningful zero-spend state instead of a shouting ฿0.00", async ({ page }) => {
    await signUp(page, "ผู้ใช้วันนี้ว่าง");
    await page.goto("/today");

    await expect(page.getByText("วันนี้ใช้ไป")).toBeVisible();
    await expect(page.getByText("ยังไม่มีรายจ่ายวันนี้")).toBeVisible();
    await expect(page.getByText("฿0.00")).toHaveCount(0);
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
    await expect(page.getByText("ภาระหนี้")).toBeVisible();
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
