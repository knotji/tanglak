import { expect, test, type Page } from "@playwright/test";
import {
  acquirePipelineLock,
  PIPELINE_LOCKED_TEST_TIMEOUT_MS,
  PIPELINE_LOCK_TIMEOUT_MS,
} from "./helpers/pipeline-lock";

const password = "password123";
const forbiddenFinancialText = /-\u0e3f0|\+\u0e3f0|\u0e3f-0|NaN|Infinity|\u221e|Invalid Date/;
const fixedMockTransactionMonth = "2026-07";
const unsafeDiagnosticText = /data:image|base64|stack trace|expected number|received undefined|Gemini quota|API key/i;

async function signUpAndOnboard(page: Page) {
  const email = `post-merge-autopilot-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  await page.context().clearCookies();
  await page.goto("/auth");
  await page.locator("section button[type='button']").nth(1).click();
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.locator("input[name='confirmPassword']").fill(password);
  await page.locator("form button:not([type='button'])").click();

  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/(onboarding|today)$/);
  await page.goto("/onboarding?edit=1");
  await page.locator("input[name='displayName']").fill("Post Merge Verification User");
  await page.locator("form button").click();
  await expect(page).toHaveURL(/\/today/);
}

async function uploadDeliverySlip(page: Page, filename = "post_merge_delivery_grab.jpg") {
  await page.goto("/upload");
  await page.locator("#document-upload-file").setInputFiles({
    name: filename,
    mimeType: "image/jpeg",
    buffer: Buffer.from("mock-delivery-data"),
  });
  await page.locator("button[type='button']").last().click();
}

async function expectNoUnsafeFinancialText(page: Page) {
  await expect(page.locator("body")).not.toContainText(forbiddenFinancialText);
  await expect(page.locator("body")).not.toContainText(unsafeDiagnosticText);
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasOverflow, `page overflowed horizontally at ${width}px`).toBe(false);
}

test.describe.serial("post-merge production verification surface", () => {
  test.describe.configure({ timeout: PIPELINE_LOCKED_TEST_TIMEOUT_MS });

  let releasePipelineLock: (() => Promise<void>) | undefined;

  test.beforeAll(async () => {
    releasePipelineLock = await acquirePipelineLock({
      label: "autopilot-post-merge-verification",
      timeoutMs: PIPELINE_LOCK_TIMEOUT_MS,
    });
  });

  test.afterAll(async () => {
    await releasePipelineLock?.();
    releasePipelineLock = undefined;
  });

  test("autopilot-created expense stays consistent across surfaces, remains single-effect on reload, and undoes cleanly", async ({
    page,
  }) => {
    await signUpAndOnboard(page);

    await page.goto("/budget");
    await page.locator("input[name='income']").fill("30000");
    await page.locator("form").first().locator("button").click();
    await expect(page.locator("body")).toContainText("30,000");

    await uploadDeliverySlip(page);
    await expect(page).toHaveURL(/\/upload\/result\//);
    await expect(page.getByText("GrabFood")).toBeVisible();
    await expect(page.locator("body")).toContainText("185");
    await expectNoUnsafeFinancialText(page);
    await page.reload();

    await page.goto(`/transactions?month=${fixedMockTransactionMonth}`);
    await expect(page.getByText("GrabFood")).toHaveCount(1);
    await expect(page.locator("body")).toContainText("185");
    await expectNoUnsafeFinancialText(page);

    await page.goto("/today");
    await expect(page.locator("body")).toContainText("185");
    await expectNoUnsafeFinancialText(page);

    await page.goto("/overview");
    await expect(page.locator("body")).toContainText("185");
    await expect(page.getByText("GrabFood")).toHaveCount(0);
    await expectNoUnsafeFinancialText(page);

    await page.goto(`/budget?month=${fixedMockTransactionMonth}`);
    await expect(page.locator("body")).toContainText("185");
    await expect(page.locator("body")).toContainText("30,000");
    await expectNoUnsafeFinancialText(page);

    await page.goto("/settings/autopilot-activity");
    await expect(page.getByText("GrabFood")).toHaveCount(1);
    await expectNoUnsafeFinancialText(page);
    for (const width of [360, 390, 430]) {
      await expectNoHorizontalOverflow(page, width);
    }

    const auditRow = page.locator("li", { hasText: "GrabFood" });
    await auditRow.locator("button").click();
    await expect(auditRow).toContainText("ยกเลิกแล้ว");
    await expect(auditRow.locator("button")).toHaveCount(0);
    await page.reload();
    await expect(page.locator("li", { hasText: "GrabFood" })).toContainText("ยกเลิกแล้ว");

    await page.goto(`/transactions?month=${fixedMockTransactionMonth}`);
    await expect(page.getByText("GrabFood")).toHaveCount(0);
    await page.goto("/overview");
    await expect(page.locator("body")).not.toContainText("185");
    await expectNoUnsafeFinancialText(page);
  });

  test("low-confidence slip falls back to review without leaking raw diagnostics", async ({ page }) => {
    await signUpAndOnboard(page);

    await page.goto("/upload");
    await page.locator("#document-upload-file").setInputFiles({
      name: "post_merge_missing_date_receipt.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("mock-missing-date-data"),
    });
    await page.locator("button[type='button']").last().click();

    await expect(page).toHaveURL(/\/upload\/review\//);
    await expect(page.locator("input[name='occurredAt']")).toHaveValue("");
    await expect(page.locator("input[name='totalPaid']")).toHaveValue("250");
    await expectNoUnsafeFinancialText(page);

    const occurredAtInput = page.locator("input[name='occurredAt']");
    await occurredAtInput.fill("2026-07-15T09:30");
    await expect(occurredAtInput).toHaveValue("2026-07-15T09:30");
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto(`/transactions?month=${fixedMockTransactionMonth}`);
    await expect(page.locator("body")).toContainText("250");
    await expect(page.locator("body")).not.toContainText("TangLak");
  });

  test("debt payment simulator remains accessible after the autopilot merge", async ({ page }) => {
    await signUpAndOnboard(page);

    await page.goto("/debts");
    await page.locator("main > div").first().locator("button").click();
    await page.locator("input[name='name']").fill("Post Merge Simulator Debt");
    await page.locator("input[name='outstanding']").fill("8320");
    await page.locator("input[name='amount']").fill("2318");
    await page.locator("input[name='minimum']").fill("2318");
    await page.locator("input[name='interestRateAnnual']").fill("33");
    await page.locator("input[name='dueDate']").fill("2026-08-19");
    await page.locator("form button").last().click();

    const card = page.locator("article", { hasText: "Post Merge Simulator Debt" });
    await expect(card).toBeVisible();
    await card.locator("a[href$='/simulate']").click();
    await expect(page).toHaveURL(/\/debts\/[a-f0-9-]+\/simulate/);

    await page.getByPlaceholder("0.00").fill("5000");
    await expect(page.locator("body")).toContainText("3,548");
    await expectNoUnsafeFinancialText(page);
  });
});
