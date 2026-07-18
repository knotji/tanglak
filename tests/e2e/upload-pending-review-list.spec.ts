import { expect, test } from "@playwright/test";
import { acquirePipelineLock, PIPELINE_LOCKED_TEST_TIMEOUT_MS } from "./helpers/pipeline-lock";

const email = `test-pending-review-${Date.now()}@example.test`;
const password = "password123";

test.describe.serial("upload page surfaces documents still waiting on review", () => {
  test.describe.configure({ timeout: PIPELINE_LOCKED_TEST_TIMEOUT_MS });

  let releasePipelineLock: (() => Promise<void>) | undefined;

  test.beforeEach(async ({}, testInfo) => {
    releasePipelineLock = await acquirePipelineLock({ label: testInfo.title });
  });

  test.afterEach(async () => {
    await releasePipelineLock?.();
    releasePipelineLock = undefined;
  });

  test("reviewing/confirming one file from a multi-file batch still leaves the other one reachable afterward", async ({
    page,
  }) => {
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
    await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ทดสอบ");
    await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
    await expect(page).toHaveURL(/\/today/);

    // Upload 2 files that both deliberately land on the manual review form
    // (low confidence, "forcereview" mock) rather than auto-saving, so both
    // stay pending after the batch finishes reading them.
    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "ใบเสร็จ/ค่าอาหาร" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([
      { name: "forcereview_first.jpg", mimeType: "image/jpeg", buffer: Buffer.from("mock-forcereview-first") },
      { name: "forcereview_second.jpg", mimeType: "image/jpeg", buffer: Buffer.from("mock-forcereview-second") },
    ]);
    await page.getByRole("button", { name: /อ่านสลิป \(2 รูป\)/ }).click();

    // Batch results list -- both need review.
    await expect(page.getByText("ประมวลผลแล้ว 2 จาก 2 รูป")).toBeVisible();
    const reviewLinks = page.getByRole("link", { name: "ตรวจสอบ" });
    await expect(reviewLinks).toHaveCount(2);

    // Review and confirm only the FIRST one.
    await reviewLinks.first().click();
    await expect(page).toHaveURL(/\/upload\/review\//);
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();
    await expect(page).toHaveURL(/\/today/);

    // The second file's document is not lost -- navigating back to /upload
    // (a fresh page load, no leftover in-memory batch state) still shows it
    // waiting for review, with a working link back into it.
    await page.goto("/upload");
    await expect(page.getByText("มีรายการรอตรวจสอบอยู่ 1 รายการ")).toBeVisible();
    await expect(page.getByText("forcereview_second.jpg")).toBeVisible();
    await page.getByRole("link", { name: "ตรวจสอบ" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);
    await page.getByRole("button", { name: "ยืนยันความถูกต้อง" }).click();
    await expect(page).toHaveURL(/\/today/);

    // Once confirmed, it no longer shows up as pending.
    await page.goto("/upload");
    await expect(page.getByText(/มีรายการรอตรวจสอบอยู่/)).toHaveCount(0);
  });

  test("a pending document can be deleted directly from the list without going through the review form", async ({
    page,
  }) => {
    const deleteEmail = `test-pending-review-delete-${Date.now()}@example.test`;
    await page.goto("/auth");
    await page.getByRole("button", { name: "สมัครใหม่" }).click();
    await page.getByLabel("อีเมล").fill(deleteEmail);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.getByLabel("ยืนยันรหัสผ่าน", { exact: true }).fill(password);
    await page.getByRole("button", { name: "สร้างบัญชี" }).click();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toMatch(/^\/(onboarding|today)$/);
    await page.goto("/onboarding?edit=1");
    await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ทดสอบ 2");
    await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "ใบเสร็จ/ค่าอาหาร" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([
      { name: "forcereview_a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("mock-forcereview-a") },
      { name: "forcereview_b.jpg", mimeType: "image/jpeg", buffer: Buffer.from("mock-forcereview-b") },
    ]);
    await page.getByRole("button", { name: /อ่านสลิป \(2 รูป\)/ }).click();
    await expect(page.getByText("ประมวลผลแล้ว 2 จาก 2 รูป")).toBeVisible();

    // Neither reviewed -- go straight back to /upload to see both pending.
    await page.goto("/upload");
    await expect(page.getByText("มีรายการรอตรวจสอบอยู่ 2 รายการ")).toBeVisible();

    // Delete the first one directly from the list.
    await page.getByRole("button", { name: "ลบ forcereview_a.jpg" }).click();
    await expect(page.getByText("ลบรายการนี้หรือไม่")).toBeVisible();
    await page.getByRole("button", { name: "ลบรายการ" }).click();
    await expect(page.getByText("ลบรายการแล้ว")).toBeVisible();

    // The deleted one is gone; the other one is still there, untouched.
    await expect(page.getByText("มีรายการรอตรวจสอบอยู่ 1 รายการ")).toBeVisible();
    await expect(page.getByText("forcereview_a.jpg")).toHaveCount(0);
    await expect(page.getByText("forcereview_b.jpg")).toBeVisible();

    // Confirmed gone even after a fresh page load (not just optimistic
    // local state).
    await page.goto("/upload");
    await expect(page.getByText("มีรายการรอตรวจสอบอยู่ 1 รายการ")).toBeVisible();
    await expect(page.getByText("forcereview_a.jpg")).toHaveCount(0);
  });
});
