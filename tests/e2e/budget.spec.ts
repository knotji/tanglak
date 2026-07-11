import { expect, test } from "@playwright/test";

const password = "password123";

async function signUp(page: import("@playwright/test").Page, name: string) {
  const email = `budget-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
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
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill(name);
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test.describe("monthly budget engine", () => {
  test("first-time monthly budget setup: no budget exists, then setting income creates it", async ({ page }) => {
    await signUp(page, "ผู้ใช้งบประมาณ");
    await page.goto("/budget");

    await expect(page.getByText("ยังไม่มีงบประมาณสำหรับเดือนนี้")).toBeVisible();

    await page.getByLabel("รายรับต่อเดือน").fill("30000");
    await page.getByRole("button", { name: "บันทึกรายรับ" }).click();

    await expect(page.getByText("บันทึกรายรับแล้ว")).toBeVisible();
    await expect(page.getByText("ยังไม่มีงบประมาณสำหรับเดือนนี้")).toHaveCount(0);
  });

  test("edit monthly income updates the summary", async ({ page }) => {
    await signUp(page, "ผู้ใช้แก้รายรับ");
    await page.goto("/budget");

    await page.getByLabel("รายรับต่อเดือน").fill("20000");
    await page.getByRole("button", { name: "บันทึกรายรับ" }).click();
    await expect(page.getByText("บันทึกรายรับแล้ว")).toBeVisible();

    await page.getByLabel("รายรับต่อเดือน").fill("25000");
    await page.getByRole("button", { name: "บันทึกรายรับ" }).click();
    await expect(page.getByText("฿25,000").first()).toBeVisible();
  });

  test("category allocation: adding a category budget shows it in the summary", async ({ page }) => {
    await signUp(page, "ผู้ใช้จัดสรรงบ");
    await page.goto("/budget");

    await page.getByLabel("รายรับต่อเดือน").fill("30000");
    await page.getByRole("button", { name: "บันทึกรายรับ" }).click();
    await expect(page.getByText("บันทึกรายรับแล้ว")).toBeVisible();

    await page.getByLabel("ชื่อหมวดหมู่ใหม่").fill("อาหาร");
    await page.getByLabel("งบประมาณหมวดหมู่ใหม่").fill("5000");
    await page.getByRole("button", { name: "+ เพิ่มหมวดหมู่งบประมาณ" }).click();

    await expect(page.getByText("อาหาร")).toBeVisible();
    await expect(page.getByText("฿5,000").first()).toBeVisible();

    // Duplicate category label is rejected.
    await page.getByLabel("ชื่อหมวดหมู่ใหม่").fill("อาหาร");
    await page.getByLabel("งบประมาณหมวดหมู่ใหม่").fill("1000");
    await page.getByRole("button", { name: "+ เพิ่มหมวดหมู่งบประมาณ" }).click();
    await expect(page.getByText("มีงบหมวดนี้ในเดือนนี้แล้ว")).toBeVisible();
  });

  test("negative category budget is rejected with the safe Thai message", async ({ page }) => {
    await signUp(page, "ผู้ใช้งบติดลบ");
    await page.goto("/budget");

    await page.getByLabel("รายรับต่อเดือน").fill("30000");
    await page.getByRole("button", { name: "บันทึกรายรับ" }).click();
    await expect(page.getByText("บันทึกรายรับแล้ว")).toBeVisible();

    await page.getByLabel("ชื่อหมวดหมู่ใหม่").fill("เดินทาง");
    await page.getByLabel("งบประมาณหมวดหมู่ใหม่").fill("-500");
    await page.getByRole("button", { name: "+ เพิ่มหมวดหมู่งบประมาณ" }).click();
    await expect(page.getByText("งบประมาณต้องไม่ติดลบ")).toBeVisible();
  });

  test("copy previous month brings categories into the new month without duplicating on retry", async ({ page }) => {
    await signUp(page, "ผู้ใช้คัดลอกงบ");

    await page.goto("/budget?month=2026-06");
    await page.getByLabel("รายรับต่อเดือน").fill("20000");
    await page.getByRole("button", { name: "บันทึกรายรับ" }).click();
    await expect(page.getByText("บันทึกรายรับแล้ว")).toBeVisible();
    await page.getByLabel("ชื่อหมวดหมู่ใหม่").fill("อาหาร");
    await page.getByLabel("งบประมาณหมวดหมู่ใหม่").fill("4000");
    await page.getByRole("button", { name: "+ เพิ่มหมวดหมู่งบประมาณ" }).click();
    await expect(page.getByText("อาหาร")).toBeVisible();

    await page.goto("/budget?month=2026-07");
    await page.getByRole("button", { name: "คัดลอกงบจากเดือนก่อนหน้า" }).click();
    await expect(page.getByText("คัดลอกงบประมาณแล้ว 1 หมวดหมู่")).toBeVisible();
    await expect(page.getByText("อาหาร")).toBeVisible();

    // Retry must not duplicate the category.
    await page.getByRole("button", { name: "คัดลอกงบจากเดือนก่อนหน้า" }).click();
    await expect(page.getByText(/ข้าม 1 รายการที่ซ้ำ/)).toBeVisible();
    const foodRows = await page.getByText("อาหาร").count();
    expect(foodRows).toBe(1);
  });

  test("copy previous month never carries the source month's income into the new month", async ({ page }) => {
    await signUp(page, "ผู้ใช้คัดลอกงบไม่เอารายรับ");

    await page.goto("/budget?month=2026-09");
    await page.getByLabel("รายรับต่อเดือน").fill("45000");
    await page.getByRole("button", { name: "บันทึกรายรับ" }).click();
    await expect(page.getByText("บันทึกรายรับแล้ว")).toBeVisible();
    await page.getByLabel("ชื่อหมวดหมู่ใหม่").fill("อาหาร");
    await page.getByLabel("งบประมาณหมวดหมู่ใหม่").fill("6000");
    await page.getByRole("button", { name: "+ เพิ่มหมวดหมู่งบประมาณ" }).click();
    await expect(page.getByText("อาหาร")).toBeVisible();

    await page.goto("/budget?month=2026-10");
    await page.getByRole("button", { name: "คัดลอกงบจากเดือนก่อนหน้า" }).click();
    await expect(page.getByText("คัดลอกงบประมาณแล้ว 1 หมวดหมู่")).toBeVisible();
    await expect(page.getByText("อาหาร")).toBeVisible();

    // The source month's income (฿45,000) must not appear anywhere in the
    // new month -- expected income stays at ฿0 until the user sets it.
    await expect(page.getByText("฿45,000")).toHaveCount(0);
    await expect(page.getByText("อย่าลืมตั้งรายรับต่อเดือน")).toBeVisible();

    // User can still set October's income afterward, independently.
    await page.getByLabel("รายรับต่อเดือน").fill("12000");
    await page.getByRole("button", { name: "บันทึกรายรับ" }).click();
    await expect(page.getByText("฿12,000").first()).toBeVisible();

    // Repeating the copy must not duplicate categories or reset the income
    // the user just set.
    await page.getByRole("button", { name: "คัดลอกงบจากเดือนก่อนหน้า" }).click();
    await expect(page.getByText(/ข้าม 1 รายการที่ซ้ำ/)).toBeVisible();
    await expect(page.getByText("฿12,000").first()).toBeVisible();
    const foodRowsAfterRepeat = await page.getByText("อาหาร").count();
    expect(foodRowsAfterRepeat).toBe(1);
  });

  test("overspending is reflected in the category status once actual spend exceeds the budget", async ({ page }) => {
    await signUp(page, "ผู้ใช้เกินงบ");
    const currentMonth = new Date().toISOString().slice(0, 7); // manual transactions use today's date

    await page.goto(`/budget?month=${currentMonth}`);
    await page.getByLabel("รายรับต่อเดือน").fill("30000");
    await page.getByRole("button", { name: "บันทึกรายรับ" }).click();
    await expect(page.getByText("บันทึกรายรับแล้ว")).toBeVisible();

    // Manual transaction entry always tags "อาหาร" -- budget exactly that
    // category at a small amount so a single expense pushes it over.
    await page.getByLabel("ชื่อหมวดหมู่ใหม่").fill("อาหาร");
    await page.getByLabel("งบประมาณหมวดหมู่ใหม่").fill("100");
    await page.getByRole("button", { name: "+ เพิ่มหมวดหมู่งบประมาณ" }).click();
    await expect(page.getByText("ปกติ")).toBeVisible(); // healthy at 0% spend

    await page.goto("/transactions");
    await page.getByRole("button", { name: "+ เพิ่มรายการ" }).click();
    await page.getByLabel("จำนวนเงิน").fill("500");
    await page.getByLabel("ชื่อรายการ").fill("Overspend Test");
    await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
    await expect(page.getByText("Overspend Test")).toBeVisible();

    await page.goto(`/budget?month=${currentMonth}`);
    await expect(page.getByText("เกินงบ").first()).toBeVisible();
    await expect(page.getByText(/ใช้ไป .*฿500.* จาก .*฿100/)).toBeVisible();
  });

  test("month navigation moves between months and back to current month", async ({ page }) => {
    await signUp(page, "ผู้ใช้เปลี่ยนเดือน");
    await page.goto("/budget?month=2026-07");
    await expect(page).toHaveURL(/month=2026-07/);

    await page.getByRole("button", { name: /เดือนถัดไป/ }).click();
    await expect(page).toHaveURL(/month=2026-08/);

    await page.getByRole("button", { name: /เดือนก่อนหน้า/ }).click();
    await page.getByRole("button", { name: /เดือนก่อนหน้า/ }).click();
    await expect(page).toHaveURL(/month=2026-06/);
  });
});
