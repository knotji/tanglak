import { expect, test } from "@playwright/test";
import { buildGenericBankStatementPdf } from "../fixtures/pdf-statements";
import { acquirePipelineLock, PIPELINE_LOCKED_TEST_TIMEOUT_MS } from "./helpers/pipeline-lock";

const password = "password123";

async function signUp(page: import("@playwright/test").Page, name: string) {
  const email = `idem-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
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
  return email;
}

async function uploadAndReachReview(page: import("@playwright/test").Page, filename: string) {
  await page.goto("/history-import");
  const buffer = await buildGenericBankStatementPdf();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("input[type='file']").click({ force: true });
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: filename, mimeType: "application/pdf", buffer });
  await page.getByRole("button", { name: "ประมวลผลและนำเข้าชุดข้อมูล" }).click();
  await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/review/);
  const batchId = page.url().match(/history-import\/([a-f0-9-]+)\/review/)?.[1] ?? "";
  return batchId;
}

test.describe.serial("History Import commit idempotency", () => {
  test.describe.configure({ timeout: PIPELINE_LOCKED_TEST_TIMEOUT_MS });

  let releasePipelineLock: (() => Promise<void>) | undefined;

  test.beforeAll(async () => {
    releasePipelineLock = await acquirePipelineLock({ label: "History Import commit idempotency" });
  });

  test.afterAll(async () => {
    await releasePipelineLock?.();
  });

  test("refresh and resubmit does not create duplicate transactions", async ({ page }) => {
    await signUp(page, "ผู้ใช้รีเฟรช");
    const batchId = await uploadAndReachReview(page, "refresh_resubmit.pdf");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "ยืนยันการนำเข้าทั้งหมด" }).click();
    await expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/summary/);

    await page.goto("/transactions?month=2026-07");
    await expect(page.getByText("MERCHANT 001 BKK").first()).toBeVisible();
    const firstCount = await page.getByText("MERCHANT 001 BKK").count();

    // Simulate a refresh-and-resubmit: navigate straight back to the review
    // page for the same batch (as if the user hit back / reloaded) and
    // confirm again.
    await page.goto(`/history-import/${batchId}/review`);
    const submitButton = page.getByRole("button", { name: /ยืนยันการนำเข้าทั้งหมด/ });
    if (await submitButton.isVisible().catch(() => false)) {
      page.once("dialog", (dialog) => dialog.accept());
      await submitButton.click();
      await page.waitForLoadState("networkidle");
    }

    await page.goto("/transactions?month=2026-07");
    const secondCount = await page.getByText("MERCHANT 001 BKK").count();
    expect(secondCount).toBe(firstCount); // no duplicate rows created by the resubmit
  });

  test("two concurrent tabs submitting the same batch do not create duplicate transactions", async ({
    page,
    context,
  }) => {
    await signUp(page, "ผู้ใช้สองแท็บ");
    const batchId = await uploadAndReachReview(page, "two_tabs.pdf");

    // A second tab in the same authenticated session (same context = same
    // cookies), viewing and submitting the identical batch -- this is the
    // real "two simultaneous commit requests" scenario, without racing
    // Playwright's own click-stability checks against React's re-render on
    // a single shared button element.
    const page2 = await context.newPage();
    await page2.goto(`/history-import/${batchId}/review`);

    const submit1 = page.getByRole("button", { name: /ยืนยันการนำเข้าทั้งหมด/ });
    const submit2 = page2.getByRole("button", { name: /ยืนยันการนำเข้าทั้งหมด/ });
    page.once("dialog", (dialog) => dialog.accept());
    page2.once("dialog", (dialog) => dialog.accept());

    await Promise.all([submit1.click(), submit2.click()]);
    await Promise.all([
      expect(page).toHaveURL(/\/history-import\/[a-f0-9-]+\/(summary|review)/, { timeout: 15_000 }),
      expect(page2).toHaveURL(/\/history-import\/[a-f0-9-]+\/(summary|review)/, { timeout: 15_000 }),
    ]);
    await page2.close();

    await page.goto("/transactions?month=2026-07");
    const rows = await page.getByText("MERCHANT 001 BKK").count();
    expect(rows).toBe(1); // exactly one transaction for this row, not two
  });

  test("another user cannot open or resume someone else's import batch", async ({ page, context }) => {
    await signUp(page, "เจ้าของชุดข้อมูล");
    const batchId = await uploadAndReachReview(page, "owner_only.pdf");

    await context.clearCookies();
    await signUp(page, "ผู้ใช้อื่น");
    const response = await page.goto(`/history-import/${batchId}/review`);
    expect(response?.status()).toBe(404);
  });
});
