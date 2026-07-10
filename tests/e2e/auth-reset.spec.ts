import { expect, test } from "@playwright/test";

test("reset page shows expired-link state without a valid recovery token", async ({ page }) => {
  await page.goto("/auth/reset");
  await expect(page.getByRole("heading", { name: "ลิงก์หมดอายุ" })).toBeVisible();
  await expect(
    page.getByText("ลิงก์รีเซ็ตรหัสผ่านนี้หมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่อีกครั้ง"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "กลับไปเข้าสู่ระบบ" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("reset page renders the form with a valid recovery token and has no bottom navigation", async ({
  page,
}) => {
  await page.goto("/auth/reset?token=valid-mock-recovery");
  await expect(page.getByRole("heading", { name: "ตั้งรหัสผ่านใหม่" })).toBeVisible();
  await expect(page.getByLabel("รหัสผ่านใหม่", { exact: true })).toBeVisible();
  await expect(page.getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("reset form shows Thai mismatch error and disables submit", async ({ page }) => {
  await page.goto("/auth/reset?token=valid-mock-recovery");
  await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill("password123");
  await page.getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true }).fill("different123");
  await expect(page.getByText("รหัสผ่านไม่ตรงกัน")).toBeVisible();
  await expect(page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่" })).toBeDisabled();
});

test("mocked successful password update redirects to /auth", async ({ page }) => {
  await page.goto("/auth/reset?token=valid-mock-recovery");
  await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill("newpassword123");
  await page.getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true }).fill("newpassword123");
  await page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่" }).click();
  await expect(page.getByText("ตั้งรหัสผ่านใหม่สำเร็จ")).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/, { timeout: 5000 });
});

test("using the recovery token a second time is treated as expired", async ({ page }) => {
  await page.goto("/auth/reset?token=valid-mock-recovery");
  await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill("newpassword123");
  await page.getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true }).fill("newpassword123");
  await page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่" }).click();
  await expect(page).toHaveURL(/\/auth$/, { timeout: 5000 });

  await page.goto("/auth/reset");
  await expect(page.getByRole("heading", { name: "ลิงก์หมดอายุ" })).toBeVisible();
});
