import { expect, test } from "@playwright/test";

const email = `readiness-${Date.now()}@example.test`;
const password = "password123";

test.describe.configure({ mode: "serial" });

async function signUp(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.getByRole("button", { name: "สมัครใหม่" }).click();
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test("onboarding is standalone, validates salary day, and allows optional reminders", async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.getByLabel("วันเงินเดือนออก").fill("32");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page.getByText("กรอกวันที่ระหว่าง 1–31")).toBeVisible();
  await page.getByLabel("วันเงินเดือนออก").fill("31");
  await page.getByLabel("7 วันก่อน").uncheck();
  await page.getByLabel("3 วันก่อน").uncheck();
  await page.getByLabel("1 วันก่อน").uncheck();
  const submit = page.getByRole("button", { name: "เริ่มใช้งาน" });
  await submit.click();
  await expect(page).toHaveURL(/\/today/);
});

test("settings account management can create edit deactivate and block unsafe delete", async ({ page }) => {
  await signIn(page);

  await page.goto("/settings");
  await page.getByRole("link", { name: /บัญชีและกระเป๋าเงิน/ }).click();
  await page.getByRole("button", { name: "+ เพิ่ม" }).click();
  await page.getByLabel("ชื่อบัญชี").fill("บัญชีพร้อมเพย์");
  await page.getByLabel("สถาบัน").fill("KBank");
  await page.getByLabel("เลขท้าย 4 หลัก").fill("4821");
  await page.getByRole("button", { name: "เพิ่มบัญชี" }).click();
  await expect(page.getByText("•••• 4821")).toBeVisible();

  await page.getByRole("button", { name: "แก้ไข" }).first().click();
  await page.getByLabel("ชื่อบัญชี").fill("บัญชีหลัก");
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(page.getByText("บัญชีหลัก")).toBeVisible();

  await page.goto("/transactions");
  await page.getByRole("button", { name: "+ เพิ่มรายการ" }).click();
  await page.getByLabel("จำนวนเงิน").fill("100");
  await page.getByLabel("ชื่อรายการ").fill("Linked account smoke");
  await page.locator('select[name="sourceAccountId"]').selectOption({ label: "บัญชีหลัก (•••• 4821)" });
  await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
  await expect(page.getByText("Linked account smoke")).toBeVisible();

  await page.goto("/settings/accounts");
  await page.getByRole("button", { name: "ปิดใช้" }).first().click();
  await page.getByRole("button", { name: "ยืนยัน" }).click();
  await expect(page.getByText("ปิดใช้งาน")).toBeVisible();
  await page.getByRole("button", { name: "ลบ" }).first().click();
  await page.getByRole("button", { name: "ยืนยัน" }).click();
  await expect(page.getByText("บัญชีนี้มีข้อมูลที่ผูกอยู่")).toBeVisible();
});

test("debt payment history persists and warns before delete", async ({ page }) => {
  await signIn(page);
  await page.goto("/debts");
  await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();
  await page.getByLabel("ชื่อหนี้").fill("บัตร Readiness");
  await page.getByLabel("ยอดคงเหลือ").fill("10000");
  await page.getByLabel("ยอดเดือนนี้").fill("2000");
  await page.getByLabel("ขั้นต่ำ").fill("2000");
  await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();
  await expect(page.getByText("บัตร Readiness")).toBeVisible();
  await page.getByRole("button", { name: "เพิ่มการชำระ" }).first().click();
  await page.getByLabel("ยอดที่ชำระ").fill("500");
  await page.getByRole("button", { name: "บันทึกการชำระ" }).click();
  await expect(page.getByText("฿500 จาก ฿2,000")).toBeVisible();
  await page.getByRole("link", { name: "ประวัติ" }).first().click();
  await expect(page.getByText("ประวัติการชำระหนี้")).toBeVisible();
  await page.reload();
  await expect(page.getByText("ประวัติการชำระหนี้")).toBeVisible();
  await page.getByRole("button", { name: "ลบ" }).first().click();
  await expect(page.getByText("ยอดจ่ายแล้วของหนี้รอบนี้จะถูกคำนวณใหม่ทันที")).toBeVisible();
});
