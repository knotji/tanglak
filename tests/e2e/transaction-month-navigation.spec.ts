import { expect, test } from "@playwright/test";

const password = "password123";

async function signUpAndCompleteOnboarding(page: import("@playwright/test").Page) {
  const email = `month-nav-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  await page.goto("/auth");
  await page.getByRole("button", { name: "สมัครใหม่" }).click();
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "สร้างบัญชี" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/(onboarding|today)$/);
  await page.goto("/onboarding?edit=1");
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้เดือนย้อนหลัง");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

async function addTransaction(
  page: import("@playwright/test").Page,
  {
    type,
    amount,
    label,
    date,
  }: {
    type: "income" | "expense";
    amount: string;
    label: string;
    date: string;
  },
) {
  await page.getByRole("button", { name: "+ เพิ่มรายการ" }).click();
  await page.getByLabel("ประเภท").selectOption(type);
  await page.getByLabel("จำนวนเงิน").fill(amount);
  await page.getByLabel("ชื่อรายการ").fill(label);
  await page.getByLabel("วันและเวลา").fill(`${date}T12:00`);
  await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
  await expect(page.getByText(label)).toBeVisible();
}

test("transactions support historical month links, filters, refresh, history navigation, and mobile widths", async ({
  page,
}) => {
  await signUpAndCompleteOnboarding(page);

  await page.goto("/transactions");
  await expect(page.getByRole("button", { name: "+ เพิ่มรายการ" })).toBeVisible();

  await page.goto("/transactions?month=2026-05");
  await addTransaction(page, {
    type: "expense",
    amount: "123.45",
    label: "Imported May 2026 Test",
    date: "2026-05-15",
  });
  await addTransaction(page, {
    type: "income",
    amount: "500",
    label: "May Salary Test",
    date: "2026-05-20",
  });

  await page.reload();
  await expect(page).toHaveURL(/\/transactions\?month=2026-05/);
  await expect(page.getByText("Imported May 2026 Test")).toBeVisible();
  await expect(page.getByText("May Salary Test")).toBeVisible();

  await page.getByRole("button", { name: "รายจ่าย" }).click();
  await expect(page.getByText("Imported May 2026 Test")).toBeVisible();
  await expect(page.getByText("May Salary Test")).toHaveCount(0);

  await page.getByRole("button", { name: "รายรับ" }).click();
  await expect(page.getByText("May Salary Test")).toBeVisible();
  await expect(page.getByText("Imported May 2026 Test")).toHaveCount(0);

  await page.getByRole("button", { name: "ทั้งหมด" }).click();
  await page.getByRole("button", { name: /เดือนก่อนหน้า 2026-04/ }).click();
  await expect(page).toHaveURL(/month=2026-04/);
  await expect(page.getByText(/ยังไม่มีรายการในเดือน/)).toBeVisible();
  await page.getByRole("button", { name: /เดือนถัดไป 2026-05/ }).click();
  await expect(page).toHaveURL(/month=2026-05/);
  await expect(page.getByText("Imported May 2026 Test")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/month=2026-04/);
  await page.goForward();
  await expect(page).toHaveURL(/month=2026-05/);

  await page.goto("/transactions?month=not-a-month");
  await expect(page.getByRole("button", { name: "+ เพิ่มรายการ" })).toBeVisible();
  await expect(page).not.toHaveURL(/month=2026-05/);

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/transactions?month=2026-05");
    await expect(page.getByText("Imported May 2026 Test")).toBeVisible();
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  }
});
