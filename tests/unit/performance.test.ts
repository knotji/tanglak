import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getProfile, upsertProfile } from "@/lib/data/profile-repository";
import { mockUserId } from "@/lib/data/mock-store";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    isMockAuthEnabled: () => true,
  };
});

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("navigation performance wiring", () => {
  it("generates distinct mock user ids for similar parallel e2e emails", () => {
    const ids = new Set([
      mockUserId("test-1783612345678@example.test"),
      mockUserId("test-1783612345679@example.test"),
      mockUserId("test-import-1783612345678@example.test"),
      mockUserId("testB-1783612345678@example.test"),
      mockUserId("loading-1783612345678-abc@example.test"),
    ]);

    expect(ids.size).toBe(5);
  });

  it("deduplicates auth and profile lookups with request-scoped React cache", () => {
    expect(readProjectFile("src/lib/auth/session.ts")).toContain("export const getCurrentUser = cache(");
    expect(readProjectFile("src/lib/data/profile-repository.ts")).toContain("export const getProfile = cache(");
  });

  it("does not leak profile cache entries across users", async () => {
    await upsertProfile("perf-user-a", {
      displayName: "A",
      preferredCurrency: "THB",
      timezone: "Asia/Bangkok",
      preferredReminderDays: [],
      wantsBudgetGuidance: false,
      onboardingCompleted: true,
    });
    await upsertProfile("perf-user-b", {
      displayName: "B",
      preferredCurrency: "THB",
      timezone: "Asia/Bangkok",
      preferredReminderDays: [1],
      wantsBudgetGuidance: true,
      onboardingCompleted: false,
    });

    await expect(getProfile("perf-user-a")).resolves.toMatchObject({
      userId: "perf-user-a",
      displayName: "A",
      onboardingCompleted: true,
    });
    await expect(getProfile("perf-user-b")).resolves.toMatchObject({
      userId: "perf-user-b",
      displayName: "B",
      onboardingCompleted: false,
    });
  });

  it("runs independent authenticated page queries in parallel", () => {
    for (const path of [
      "src/app/today/page.tsx",
      "src/app/transactions/page.tsx",
      "src/app/debts/page.tsx",
      "src/app/overview/page.tsx",
    ]) {
      const source = readProjectFile(path);
      expect(source).toContain("Promise.all");
      expect(source).toContain("requireCompletedOnboarding(user)");
    }
  });

  it("keeps route loading UI inside the shared app shell with page headers", () => {
    for (const path of [
      "src/app/today/loading.tsx",
      "src/app/transactions/loading.tsx",
      "src/app/debts/loading.tsx",
      "src/app/overview/loading.tsx",
      "src/app/budget/loading.tsx",
      "src/app/upload/loading.tsx",
      "src/app/history-import/loading.tsx",
    ]) {
      const source = readProjectFile(path);
      expect(source).toContain('<AppShell contentElement="div">');
      expect(source).toContain("<PageHeader");
    }
  });

  it("keeps only completed pages responsible for the main content landmark", () => {
    const appShell = readProjectFile("src/components/AppShell.tsx");

    expect(appShell).toContain('contentElement?: "main" | "div"');
    expect(appShell).toContain('contentElement = "main"');
    expect(appShell).toContain('id: "main-content"');
    expect(appShell).toContain("contentElement === \"main\"");

    for (const path of [
      "src/app/today/loading.tsx",
      "src/app/transactions/loading.tsx",
      "src/app/debts/loading.tsx",
      "src/app/overview/loading.tsx",
      "src/app/budget/loading.tsx",
      "src/app/upload/loading.tsx",
      "src/app/history-import/loading.tsx",
    ]) {
      const source = readProjectFile(path);
      expect(source).toContain('contentElement="div"');
      expect(source).not.toContain('id="main-content"');
    }
  });

  it("keeps navigation progress in the shared shell without replacing the page chrome", () => {
    const appShell = readProjectFile("src/components/AppShell.tsx");
    const progress = readProjectFile("src/components/feedback/RouteProgress.tsx");

    expect(appShell).toContain("<RouteProgress />");
    expect(appShell).toContain("<BottomNavigation />");
    expect(progress).toContain("fixed inset-x-0 top-0");
    expect(progress).not.toContain("animate-spin");
  });

  it("uses delayed accessible loading copy and a slow retry threshold", () => {
    const delayed = readProjectFile("src/components/feedback/DelayedLoadingMessage.tsx");

    expect(delayed).toContain("delayMs = 600");
    expect(delayed).toContain("slowMs = 1500");
    expect(delayed).toContain("retryMs = 5000");
    expect(delayed).toContain('aria-live="polite"');
    expect(delayed).toContain("ใช้เวลานานกว่าปกติ");
    expect(delayed).toContain("ลองใหม่");
  });

  it("uses page-specific route loading skeletons instead of full-page generic cards", () => {
    const expectations = [
      ["src/app/today/loading.tsx", ["กำลังโหลดข้อมูล", "grid grid-cols-2", "rounded-[14px]"]],
      ["src/app/transactions/loading.tsx", ["ทั้งหมด", "รายจ่าย", "รายรับ"]],
      ["src/app/debts/loading.tsx", ["กำลังอัปเดตยอดหนี้", "grid grid-cols-2"]],
      ["src/app/overview/loading.tsx", ["กำลังสรุปภาพรวม", "grid grid-cols-3"]],
    ] as const;

    for (const [path, markers] of expectations) {
      const source = readProjectFile(path);
      expect(source).not.toContain("<RouteSkeleton");
      expect(source).not.toContain("<EmptyState");
      expect(source).toContain("<DelayedLoadingMessage");
      for (const marker of markers) {
        expect(source).toContain(marker);
      }
    }
  });

  it("keeps skeleton blocks quiet for assistive technology", () => {
    for (const path of [
      "src/app/today/loading.tsx",
      "src/app/transactions/loading.tsx",
      "src/app/debts/loading.tsx",
      "src/app/overview/loading.tsx",
    ]) {
      expect(readProjectFile(path)).toContain('aria-hidden="true"');
    }
  });

  it("shows real step labels for slip upload without fake percentages", () => {
    const historyPage = readProjectFile("src/app/history-import/page.tsx");
    const upload = readProjectFile("src/app/upload/UploadClient.tsx");
    const stepProgress = readProjectFile("src/components/feedback/StepProgress.tsx");

    expect(historyPage).not.toContain("HistoryImportClient");
    for (const label of ["กำลังอัปโหลดสลิป", "กำลังอ่านข้อมูลจากสลิป", "ตรวจสอบข้อมูลก่อนบันทึก", "พร้อมให้คุณยืนยันรายการ"]) {
      expect(upload).toContain(label);
    }

    expect(upload).toContain('setProgressStep("upload_evidence")');
    expect(upload).toContain('setProgressStep("ai_reading")');
    expect(upload).toContain('setProgressStep("checking_data")');
    expect(upload).toContain('setProgressStep("ready_to_confirm")');
    expect(upload).not.toContain("%");
    expect(historyPage).not.toContain("%");
    expect(stepProgress).not.toContain("%");
  });

  it("marks loading buttons as busy and disabled without clearing selected upload state", () => {
    const historyPage = readProjectFile("src/app/history-import/page.tsx");
    const upload = readProjectFile("src/app/upload/UploadClient.tsx");

    expect(historyPage).not.toContain("input[type='file']");
    expect(upload).toContain("disabled={isProcessing}");
    expect(upload).toContain("aria-busy={isProcessing}");
    // Each file's failure is surfaced individually in the per-file results
    // list (a single global error banner can't distinguish which file among
    // several failed), rather than one page-level errorMessage.
    expect(upload).toContain('status: "error", message: res.message');
    expect(upload).toContain("setIsProcessing(false)");
  });

  it("keeps bottom navigation links prefetchable for primary authenticated routes", () => {
    const source = readProjectFile("src/components/BottomNavigation.tsx");
    expect(source).toContain("import Link from \"next/link\"");
    expect(source).not.toContain("prefetch={false}");
    expect(source).toContain("href: \"/today\"");
    expect(source).toContain("href: \"/transactions\"");
    expect(source).toContain("href: \"/debts\"");
    expect(source).toContain("href: \"/overview\"");
  });

  it("does not select raw extraction payloads for dashboard navigation queries", () => {
    const financeRepository = readProjectFile("src/lib/data/finance-repository.ts");
    const overviewPage = readProjectFile("src/app/overview/page.tsx");
    const listColumns = financeRepository.match(/const IMPORT_BATCH_LIST_COLUMNS =\s+"([^"]+)"/);

    expect(overviewPage).not.toContain("getDocumentExtraction");
    expect(overviewPage).not.toContain("document_extractions");
    expect(listColumns?.[1]).not.toContain("statement_metadata");
    expect(listColumns?.[1]).not.toContain("detected_layout");
    expect(listColumns?.[1]).not.toContain("raw_output");
    expect(listColumns?.[1]).not.toContain("normalized_preview");
  });
});
