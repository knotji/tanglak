import { expect, test } from "@playwright/test";

const password = "password123";

async function loginAndCompleteOnboarding(page: import("@playwright/test").Page) {
  const email = `legacy-history-settings-${Date.now()}@example.test`;
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
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ตั้งค่า");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test("settings keeps old batch history but does not link to a new import flow", async ({ page }) => {
  await loginAndCompleteOnboarding(page);

  await page.goto("/settings");
  await expect(page.getByRole("link", { name: /ข้อมูลที่เคยบันทึก/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /การนำเข้ารายการแบบเดิม/ })).toHaveCount(0);

  await page.getByRole("link", { name: /ข้อมูลที่เคยบันทึก/ }).click();
  await expect(page).toHaveURL(/\/settings\/data/);
  await expect(page.getByRole("heading", { name: "ข้อมูลที่เคยบันทึก" })).toBeVisible();
  await expect(page.getByRole("link", { name: /การนำเข้ารายการแบบเดิม/ })).toHaveCount(0);
  await expect(page.getByText("ยังไม่มีประวัติการนำเข้าย้อนหลัง")).toBeVisible();
});
