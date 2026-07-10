import { expect, test } from "@playwright/test";

const recoveryToken = (name: string) => `valid-mock-recovery-${name}`;

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
  await page.goto(`/auth/reset?token=${recoveryToken("render")}`);
  await expect(page.getByRole("heading", { name: "ตั้งรหัสผ่านใหม่" })).toBeVisible();
  await expect(page.getByLabel("รหัสผ่านใหม่", { exact: true })).toBeVisible();
  await expect(page.getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("reset form shows Thai mismatch error and disables submit", async ({ page }) => {
  await page.goto(`/auth/reset?token=${recoveryToken("mismatch")}`);
  await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill("password123");
  await page.getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true }).fill("different123");
  await expect(page.getByText("รหัสผ่านไม่ตรงกัน")).toBeVisible();
  await expect(page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่" })).toBeDisabled();
});

test("mocked successful password update redirects to /auth", async ({ page }) => {
  await page.goto(`/auth/reset?token=${recoveryToken("success")}`);
  await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill("newpassword123");
  await page.getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true }).fill("newpassword123");
  await page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่" }).click();
  await expect(page.getByText("ตั้งรหัสผ่านใหม่สำเร็จ")).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/, { timeout: 5000 });
});

test("using the recovery token a second time is treated as expired", async ({ page }) => {
  const token = recoveryToken("reuse");
  await page.goto(`/auth/reset?token=${token}`);
  await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill("newpassword123");
  await page.getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true }).fill("newpassword123");
  await page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่" }).click();
  await expect(page).toHaveURL(/\/auth$/, { timeout: 5000 });

  await page.goto(`/auth/reset?token=${token}`);
  await expect(page.getByRole("heading", { name: "ลิงก์หมดอายุ" })).toBeVisible();
});

test("consuming one mock recovery token does not invalidate another valid token", async ({
  browser,
}) => {
  const tokenA = recoveryToken("parallel-a");
  const tokenB = recoveryToken("parallel-b");
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await Promise.all([
      pageA.goto(`/auth/reset?token=${tokenA}`),
      pageB.goto(`/auth/reset?token=${tokenB}`),
    ]);
    await expect(pageA.getByRole("heading", { name: "ตั้งรหัสผ่านใหม่" })).toBeVisible();
    await expect(pageB.getByRole("heading", { name: "ตั้งรหัสผ่านใหม่" })).toBeVisible();

    await pageA.getByLabel("รหัสผ่านใหม่", { exact: true }).fill("newpassword123");
    await pageA.getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true }).fill("newpassword123");
    await pageA.getByRole("button", { name: "ตั้งรหัสผ่านใหม่" }).click();
    await expect(pageA).toHaveURL(/\/auth$/, { timeout: 5000 });

    await pageA.goto(`/auth/reset?token=${tokenA}`);
    await expect(pageA.getByRole("heading", { name: "ลิงก์หมดอายุ" })).toBeVisible();

    await pageB.getByLabel("รหัสผ่านใหม่", { exact: true }).fill("newpassword456");
    await pageB.getByLabel("ยืนยันรหัสผ่านใหม่", { exact: true }).fill("newpassword456");
    await pageB.getByRole("button", { name: "ตั้งรหัสผ่านใหม่" }).click();
    await expect(pageB).toHaveURL(/\/auth$/, { timeout: 5000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
