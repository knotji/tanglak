import { expect, test } from "@playwright/test";
import { acquirePipelineLock, PIPELINE_LOCKED_TEST_TIMEOUT_MS } from "./helpers/pipeline-lock";

const email = `config-hydration-${Date.now()}@example.test`;
const password = "password123";

/**
 * Regression coverage for a deterministic SSR hydration mismatch: AppShell
 * (and the ConfigError it always renders) is reachable from several
 * "use client" components -- most notably ReviewForm on
 * /upload/review/[documentId] -- so it is bundled and re-executed in the
 * browser during hydration, not just rendered once on the server. The
 * underlying Supabase public-config check previously read NEXT_PUBLIC_*
 * variables via `process.env[key]` with a variable key, which Next.js's
 * build-time env inlining cannot statically rewrite into the client
 * bundle -- causing the server (real Node.js env) and the client (bundler-
 * stubbed env) to disagree about whether Supabase was configured, and
 * React to report a hydration mismatch.
 *
 * This suite loads real pages through the actual Next.js server (the same
 * one every other e2e spec in this repo runs against) and asserts the
 * browser console never reports a hydration mismatch, on both the exact
 * reported route and another route that also reaches AppShell from a
 * "use client" component tree.
 */

function collectConsoleIssues(page: import("@playwright/test").Page) {
  const issues: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = msg.text();
    if (/hydrat/i.test(text) || /did not match/i.test(text) || /server rendered html/i.test(text)) {
      issues.push(text);
    }
  });
  page.on("pageerror", (error) => {
    if (/hydrat/i.test(error.message)) {
      issues.push(error.message);
    }
  });
  return issues;
}

async function signUpAndOnboard(page: import("@playwright/test").Page) {
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
  await page.getByLabel("ชื่อที่อยากให้เรียก").fill("ผู้ใช้ทดสอบ Config");
  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test.describe.serial("Supabase config hydration", () => {
  test.describe.configure({ timeout: PIPELINE_LOCKED_TEST_TIMEOUT_MS });

  let releasePipelineLock: (() => Promise<void>) | undefined;

  test.beforeEach(async ({}, testInfo) => {
    releasePipelineLock = await acquirePipelineLock({ label: testInfo.title });
  });

  test.afterEach(async () => {
    await releasePipelineLock?.();
    releasePipelineLock = undefined;
  });

  test("the review page (AppShell reached via a 'use client' component) hydrates without a mismatch, and ConfigError does not render when configured", async ({
    page,
  }) => {
    const issues = collectConsoleIssues(page);

    await signUpAndOnboard(page);

    await page.goto("/upload");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "ใบเสร็จ/ค่าอาหาร" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "config_hydration_receipt_forcereview.png",
      mimeType: "image/png",
      buffer: Buffer.from("mock-config-hydration-data"),
    });
    await page.getByRole("button", { name: "วิเคราะห์ด้วย AI" }).click();
    await expect(page).toHaveURL(/\/upload\/review\//);
    const reviewUrl = page.url();

    // The review form itself must be visible -- proving AppShell rendered
    // its normal children, not ConfigError, on this "use client" boundary.
    await expect(page.getByRole("heading", { name: "ตรวจสลิปและหลักฐาน" })).toBeVisible();
    await expect(page.getByText("ตั้งค่า Supabase ยังไม่ครบ")).toHaveCount(0);

    // Refreshing the same route directly (a fresh SSR + hydration cycle,
    // not a client-side transition) must behave identically.
    await page.reload();
    await expect(page.getByRole("heading", { name: "ตรวจสลิปและหลักฐาน" })).toBeVisible();
    await expect(page.getByText("ตั้งค่า Supabase ยังไม่ครบ")).toHaveCount(0);

    // Navigate away and back client-side (no full page reload) to also
    // exercise the client-transition rendering path.
    await page.goto("/today");
    await page.goto(reviewUrl);
    await expect(page.getByRole("heading", { name: "ตรวจสลิปและหลักฐาน" })).toBeVisible();

    expect(issues, `Hydration-related console messages: ${JSON.stringify(issues)}`).toHaveLength(0);
  });

  test("a transactions-page 'use client' AppShell boundary also hydrates without a mismatch", async ({ page }) => {
    const issues = collectConsoleIssues(page);

    await page.goto("/auth");
    await page.getByLabel("อีเมล").fill(email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
    await page.locator("form").getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "รายการ" })).toBeVisible();
    await expect(page.getByText("ตั้งค่า Supabase ยังไม่ครบ")).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "รายการ" })).toBeVisible();

    expect(issues, `Hydration-related console messages: ${JSON.stringify(issues)}`).toHaveLength(0);
  });
});
