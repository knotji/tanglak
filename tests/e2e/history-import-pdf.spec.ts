import { expect, test } from "@playwright/test";

const password = "password123";

async function login(page: import("@playwright/test").Page) {
  const email = `legacy-history-direct-${Date.now()}@example.test`;
  await page.goto("/auth");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.reload();
  await page.getByRole("button", { name: "สมัครใหม่" }).click();
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/(onboarding|today)$/);
  await page.goto("/onboarding?edit=1");
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ทางตรง");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test("direct legacy history URL gives recovery choices instead of parsing controls", async ({ page }) => {
  await login(page);
  await page.goto("/history-import");

  await expect(page.locator("input[type='file']")).toHaveCount(0);
  await page.getByRole("link", { name: "เพิ่มรายการเอง" }).click();
  await expect(page).toHaveURL(/\/transactions/);
  await expect(page.getByRole("button", { name: "+ เพิ่มรายการ" })).toBeVisible();
});
