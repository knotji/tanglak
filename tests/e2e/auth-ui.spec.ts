import { expect, test } from "@playwright/test";

test("auth screen has no bottom navigation", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.getByText("เห็นเงินชัด จัดหนี้เป็น ใช้ชีวิตต่อได้")).toBeVisible();
  await expect(page.getByText("ข้อมูลการเงินของคุณ เป็นของคุณคนเดียว")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("password visibility toggle works", async ({ page }) => {
  await page.goto("/auth");
  const passwordInput = page.getByLabel("รหัสผ่าน", { exact: true });
  await passwordInput.fill("secret123");
  await expect(passwordInput).toHaveAttribute("type", "password");

  const toggle = page.getByRole("button", { name: "แสดงรหัสผ่าน" });
  await toggle.click();
  await expect(passwordInput).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "ซ่อนรหัสผ่าน" })).toBeVisible();
});

test("sign-up shows Thai error when passwords do not match", async ({ page }) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "สมัครใหม่" }).click();
  await page.getByLabel("อีเมล").fill(`mismatch-${Date.now()}@example.test`);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("password123");
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill("different123");
  await expect(page.getByText("รหัสผ่านไม่ตรงกัน")).toBeVisible();
  await expect(page.getByRole("button", { name: "สร้างบัญชี" })).toBeDisabled();
});

test("sign-up shows email verification note", async ({ page }) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "สมัครใหม่" }).click();
  await expect(page.getByText("หลังสมัครสำเร็จ เราจะส่งอีเมลยืนยันตัวตนไปที่กล่องข้อความของคุณ")).toBeVisible();
});

test("forgot-password flow can submit an email", async ({ page }) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "ลืมรหัสผ่าน?" }).click();
  await expect(page.getByRole("heading", { name: "ลืมรหัสผ่าน" })).toBeVisible();
  await page.getByLabel("อีเมล").fill(`forgot-${Date.now()}@example.test`);
  await page.getByRole("button", { name: "ส่งลิงก์รีเซ็ตรหัสผ่าน" }).click();
  await expect(page.getByText("ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว ตรวจสอบอีเมลของคุณ")).toBeVisible();

  await page.getByRole("button", { name: "กลับไปเข้าสู่ระบบ" }).click();
  await expect(page.getByLabel("อีเมล")).toBeVisible();
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" }).first()).toBeVisible();
});

for (const width of [360, 390, 430]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/auth");
    await page.getByRole("button", { name: "สมัครใหม่" }).click();
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });
}
