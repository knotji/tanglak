import { expect, test } from "@playwright/test";

const password = "password123";

async function signUp(page: import("@playwright/test").Page, name: string) {
  const email = `simulator-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
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

test.describe("Debt Payment Simulator E2E", () => {
  test("creates a debt and runs the payment simulator correctly", async ({ page }) => {
    // 1. Sign up
    await signUp(page, "ผู้ทดลองจำลองหนี้");

    // 2. Navigate to Debts page
    await page.goto("/debts");
    await expect(page.getByRole("heading", { name: "หนี้" })).toBeVisible();

    // 3. Click Add Debt button
    await page.getByRole("button", { name: "+ เพิ่มหนี้" }).click();
    await page.getByLabel("ชื่อหนี้").fill("หนี้ทดสอบ E2E");
    await page.getByLabel("ยอดคงเหลือ").fill("8320");
    await page.getByLabel("ยอดเดือนนี้").fill("2318");
    await page.getByLabel("ขั้นต่ำ").fill("2318");
    await page.getByLabel("อัตราดอกเบี้ยต่อปี (%)").fill("33"); // 33% annual nominal -> 2.75% monthly
    await page.getByLabel("ครบกำหนด", { exact: true }).fill("2026-08-19");
    await page.getByRole("button", { name: "เพิ่มหนี้", exact: true }).click();

    // 4. Verify debt card is created and has "ควรจ่ายเท่าไร" CTA button
    const card = page.locator("article", { hasText: "หนี้ทดสอบ E2E" });
    await expect(card).toBeVisible();
    
    const ctaButton = card.getByRole("link", { name: "ควรจ่ายเท่าไร" });
    await expect(ctaButton).toBeVisible();

    // 5. Open simulator by clicking CTA
    await ctaButton.click();
    await expect(page).toHaveURL(/\/debts\/[a-f0-9-]+\/simulate/);

    // 6. Verify top summary details
    await expect(page.getByRole("heading", { name: "วางแผนจ่ายหนี้" })).toBeVisible();
    await expect(page.getByText("หนี้ทดสอบ E2E")).toBeVisible();
    await expect(page.getByText("฿8,320")).toBeVisible();
    await expect(page.getByText("33% ต่อปี")).toBeVisible();

    // 7. Verify plan cards are visible
    await expect(page.getByText("ขั้นต่ำ").first()).toBeVisible();
    await expect(page.getByText("แนะนำ").first()).toBeVisible();
    await expect(page.getByText("เร่งปิด").first()).toBeVisible();

    // 8. Custom payment input and live update
    const customInput = page.getByPlaceholder("0.00");
    await expect(customInput).toBeVisible();
    
    // Fill custom payment amount
    await customInput.fill("5000");
    
    // Verify it updates results and doesn't crash
    await expect(page.getByText("ยอดคงเหลือหลังจ่าย")).toBeVisible();
    await expect(page.getByText("฿3,548")).toBeVisible(); // 8320 + 228 interest - 5000 = 3548
    
    // 9. Check lender warning is present
    await expect(page.getByText("ควรตรวจสอบกับผู้ให้กู้ก่อนว่าเงินที่จ่ายเกินขั้นต่ำจะถูกนำไปลดเงินต้นหรือไม่").first()).toBeVisible();

    // 10. Click Back to check navigation
    await page.getByRole("link", { name: "ย้อนกลับ" }).click();
    await expect(page).toHaveURL(/\/debts\/[a-f0-9-]+/); // routes back to history/details
  });
});
