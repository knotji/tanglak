import { expect, test } from "@playwright/test";

const password = "password123";

async function loginAndCompleteOnboarding(page: import("@playwright/test").Page) {
  const email = `legacy-history-${Date.now()}@example.test`;
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
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้จริง");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test("legacy history route no longer exposes a new file-import form", async ({ page }) => {
  await loginAndCompleteOnboarding(page);

  await page.goto("/history-import");

  await expect(page.getByRole("heading", { name: "เพิ่มข้อมูลการเงิน" })).toBeVisible();
  await expect(page.getByText("การนำเข้ารายการย้อนหลังถูกนำออกจากหน้าผลิตภัณฑ์แล้ว")).toBeVisible();
  await expect(page.locator("input[type='file']")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "อัปโหลดสลิป" })).toBeVisible();
  await expect(page.getByRole("link", { name: "เพิ่มรายการเอง" })).toBeVisible();
});
