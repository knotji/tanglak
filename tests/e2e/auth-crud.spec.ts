import { expect, test } from "@playwright/test";

const emailA = `a-${Date.now()}@example.test`;
const emailB = `b-${Date.now()}@example.test`;
const password = "password123";

async function completeOnboarding(page: import("@playwright/test").Page) {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ทดสอบ");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test("protected route redirects to auth and first login redirects to onboarding", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/auth/);
  await page.getByRole("button", { name: "สมัครใหม่" }).click();
  await page.getByLabel("อีเมล").fill(emailA);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();
  await completeOnboarding(page);
});

test("add transaction, delete with confirmation, add debt and payment, persist after refresh", async ({ page }) => {
  await page.goto("/auth");
  await page.getByLabel("อีเมล").fill(emailA);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page).toHaveURL(/\/today/);

  await page.goto("/transactions");
  await page.getByRole("button", { name: "+ เพิ่มรายการ" }).click();
  await page.getByLabel("จำนวนเงิน").fill("189");
  await page.getByLabel("ชื่อรายการ").fill("GrabFood Test");
  const saveButton = page.getByRole("button", { name: "เพิ่มรายการ", exact: true });
  await saveButton.click();
  await expect(page.getByText("GrabFood Test")).toBeVisible();

  await page.getByRole("button", { name: "เปิดรายละเอียดรายการ GrabFood Test" }).click();
  await page.getByRole("button", { name: "ลบรายการนี้" }).click();
  await expect(page.getByText("รายการนี้จะถูกลบออกจากเดือนนี้")).toBeVisible();
  await page.getByRole("button", { name: "ยกเลิก" }).click();
  await expect(page.getByText("GrabFood Test")).toBeVisible();
  await page.getByRole("button", { name: "เปิดรายละเอียดรายการ GrabFood Test" }).click();
  await page.getByRole("button", { name: "ลบรายการนี้" }).click();
  await page.getByRole("button", { name: "ลบรายการนี้" }).click();
  await expect(page.getByText("GrabFood Test")).toHaveCount(0);

  await page.goto("/debts");
  await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();
  await page.getByLabel("ชื่อหนี้").fill("KTC Test");
  await page.getByLabel("ยอดคงเหลือ").fill("32450");
  await page.getByLabel("ยอดเดือนนี้").fill("3200");
  await page.getByLabel("ขั้นต่ำ").fill("3200");
  await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();
  await expect(page.getByText("KTC Test")).toBeVisible();

  await page.getByRole("button", { name: "เพิ่มการชำระ" }).first().click();
  await page.getByLabel("ยอดที่ชำระ").fill("1500");
  await page.getByRole("button", { name: "บันทึกการชำระ" }).click();
  await expect(page.getByText("฿1,500 จาก ฿3,200")).toBeVisible();

  await page.getByRole("button", { name: "ปิดหนี้" }).first().click();
  await expect(page.getByText("ปิดหนี้เป็นชำระครบแล้ว")).toBeVisible();
  await page.getByRole("button", { name: "ปิดหนี้เป็นชำระครบแล้ว" }).click();
  // Reopening a closed debt is deferred to Phase 2 (F-001) -- closing shows
  // a static "closed" state with history still reachable, never a reopen
  // control.
  await expect(page.getByText("ข้อมูลและประวัติการชำระยังคงเก็บไว้")).toBeVisible();
  await expect(page.getByRole("button", { name: /เปิดใหม่/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("KTC Test")).toBeVisible();
});

test("sign in restores session and user data is isolated", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/auth");
  await page.getByLabel("อีเมล").fill(emailA);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page).toHaveURL(/\/today/);
  await page.goto("/debts");
  await expect(page.getByText("KTC Test")).toBeVisible();

  await context.clearCookies();
  await page.goto("/today");
  await expect(page).toHaveURL(/\/auth/);
  await page.getByRole("button", { name: "สมัครใหม่" }).click();
  await page.getByLabel("อีเมล").fill(emailB);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();
  await completeOnboarding(page);
  await page.goto("/debts");
  await expect(page.getByText("KTC Test")).toHaveCount(0);
});
