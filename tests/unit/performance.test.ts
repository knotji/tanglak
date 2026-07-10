import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getProfile, upsertProfile } from "@/lib/data/profile-repository";

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
    ]) {
      const source = readProjectFile(path);
      expect(source).toContain("<AppShell>");
      expect(source).toContain("<PageHeader");
    }
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
