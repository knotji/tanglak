import { expect, test } from "@playwright/test";

const password = "password123";

async function createReadyUser(page: import("@playwright/test").Page) {
  const email = `loading-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
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
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้โหลดเร็ว");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

async function expectSingleMainLandmark(page: import("@playwright/test").Page) {
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("#main-content")).toHaveCount(1);
  await expect(page.locator("main#main-content")).toBeVisible();
  await expect(page.locator('a[href="#main-content"]')).toHaveCount(1);

  const skipTargetTag = await page.locator('a[href="#main-content"]').evaluate((link) => {
    const targetId = link.getAttribute("href")?.slice(1);
    return targetId ? document.getElementById(targetId)?.tagName.toLowerCase() : null;
  });
  expect(skipTargetTag).toBe("main");
}

test.describe("loading and navigation UX", () => {
  test.beforeEach(async ({ page }) => {
    await createReadyUser(page);
  });

  test("shell remains visible and primary routes avoid mobile overflow", async ({ page }) => {
    await page.goto("/debts");

    await expect(page.getByRole("heading", { name: "หนี้" })).toBeVisible();
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByRole("link", { name: "วันนี้" })).toBeVisible();
    await expect(page.getByRole("link", { name: "รายการ" })).toBeVisible();
    await expect(page.getByRole("link", { name: "งบ", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "หนี้", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "ภาพรวม" })).toBeVisible();

    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });

      for (const route of ["/today", "/transactions", "/debts", "/overview", "/budget", "/upload", "/history-import"]) {
        await page.goto(route);
        await expectSingleMainLandmark(page);
        const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(hasOverflow, `${route} overflowed at ${width}px`).toBe(false);
      }
    }
  });
});
