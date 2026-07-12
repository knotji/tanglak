import { describe, expect, it } from "vitest";
import {
  buildBudgetSummary,
  calculateCategorySpend,
  statusForCategory,
  summarizeCategory,
} from "@/lib/finance/budget-calculations";
import { formatTHB } from "@/lib/finance/money";
import type { BudgetCategory, MonthlyBudget, Transaction } from "@/types/domain";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? "tx",
    userId: "user-a",
    type: "expense",
    status: "confirmed",
    amountSatang: 10_000,
    currency: "THB",
    occurredAt: "2026-07-10T12:00:00+07:00",
    source: "manual",
    ...overrides,
  };
}

function budget(overrides: Partial<MonthlyBudget> = {}): MonthlyBudget {
  return {
    id: "budget-1",
    userId: "user-a",
    month: "2026-07",
    incomeSatang: 300_000,
    strategy: "minimum_first",
    status: "draft",
    createdAt: "2026-07-01T00:00:00+07:00",
    updatedAt: "2026-07-01T00:00:00+07:00",
    ...overrides,
  };
}

function category(overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: "cat-1",
    userId: "user-a",
    monthlyBudgetId: "budget-1",
    label: "อาหาร",
    amountSatang: 5_000_00,
    createdAt: "2026-07-01T00:00:00+07:00",
    updatedAt: "2026-07-01T00:00:00+07:00",
    ...overrides,
  };
}

describe("calculateCategorySpend — transaction inclusion rules", () => {
  it("counts confirmed expense transactions toward their category", () => {
    const spend = calculateCategorySpend(
      [tx({ type: "expense", category: "อาหาร", amountSatang: 1_000 })],
      "2026-07",
    );
    expect(spend.byLabel["อาหาร"]).toBe(1_000);
  });

  it("counts confirmed debt_payment transactions toward their category", () => {
    const spend = calculateCategorySpend(
      [tx({ type: "debt_payment", category: "หนี้สิน", amountSatang: 2_000 })],
      "2026-07",
    );
    expect(spend.byLabel["หนี้สิน"]).toBe(2_000);
  });

  it("excludes income transactions entirely", () => {
    const spend = calculateCategorySpend(
      [tx({ type: "income", category: "อาหาร", amountSatang: 5_000 })],
      "2026-07",
    );
    expect(spend.byLabel["อาหาร"]).toBeUndefined();
  });

  it("excludes transfer transactions entirely", () => {
    const spend = calculateCategorySpend(
      [tx({ type: "transfer", category: "อาหาร", amountSatang: 5_000 })],
      "2026-07",
    );
    expect(spend.byLabel["อาหาร"]).toBeUndefined();
  });

  it("offsets (reduces) a category's spend with a matching refund, never going negative", () => {
    const spend = calculateCategorySpend(
      [
        tx({ id: "a", type: "expense", category: "ช้อปปิ้ง", amountSatang: 1_000 }),
        tx({ id: "b", type: "refund", category: "ช้อปปิ้ง", amountSatang: 400 }),
      ],
      "2026-07",
    );
    expect(spend.byLabel["ช้อปปิ้ง"]).toBe(600);
  });

  it("floors a category's spend at zero even if refunds exceed expenses", () => {
    const spend = calculateCategorySpend(
      [
        tx({ id: "a", type: "expense", category: "ช้อปปิ้ง", amountSatang: 100 }),
        tx({ id: "b", type: "refund", category: "ช้อปปิ้ง", amountSatang: 500 }),
      ],
      "2026-07",
    );
    expect(spend.byLabel["ช้อปปิ้ง"]).toBe(0);
  });

  it("excludes unconfirmed (draft/needs_review/rejected) transactions", () => {
    const spend = calculateCategorySpend(
      [
        tx({ id: "a", status: "draft", category: "อาหาร", amountSatang: 1_000 }),
        tx({ id: "b", status: "needs_review", category: "อาหาร", amountSatang: 1_000 }),
        tx({ id: "c", status: "rejected", category: "อาหาร", amountSatang: 1_000 }),
      ],
      "2026-07",
    );
    expect(spend.byLabel["อาหาร"]).toBeUndefined();
  });

  it("excludes transactions outside the requested month", () => {
    const spend = calculateCategorySpend(
      [tx({ occurredAt: "2026-06-30T23:59:00+07:00", category: "อาหาร", amountSatang: 1_000 })],
      "2026-07",
    );
    expect(spend.byLabel["อาหาร"]).toBeUndefined();
  });

  it("routes uncategorized expense spend into uncategorizedSatang, not byLabel", () => {
    const spend = calculateCategorySpend([tx({ type: "expense", category: undefined, amountSatang: 750 })], "2026-07");
    expect(spend.uncategorizedSatang).toBe(750);
    expect(Object.keys(spend.byLabel)).toHaveLength(0);
  });

  it("treats a blank/whitespace-only category label as uncategorized", () => {
    const spend = calculateCategorySpend([tx({ type: "expense", category: "   ", amountSatang: 750 })], "2026-07");
    expect(spend.uncategorizedSatang).toBe(750);
  });

  it("matches a transaction whose category has surrounding whitespace to the trimmed budget label", () => {
    const spend = calculateCategorySpend(
      [tx({ type: "expense", category: "  อาหาร  ", amountSatang: 600 })],
      "2026-07",
    );
    expect(spend.byLabel["อาหาร"]).toBe(600);
    expect(spend.byLabel["  อาหาร  "]).toBeUndefined();
  });
});

describe("statusForCategory — status thresholds", () => {
  it("is healthy below 80% usage", () => {
    expect(statusForCategory(1_000, 799)).toBe("healthy");
  });

  it("is near_limit from 80% up to and including 100%", () => {
    expect(statusForCategory(1_000, 800)).toBe("near_limit");
    expect(statusForCategory(1_000, 1_000)).toBe("near_limit");
  });

  it("is overspent strictly above 100%", () => {
    expect(statusForCategory(1_000, 1_001)).toBe("overspent");
  });

  it("is no_budget when budgeted is zero and nothing was spent", () => {
    expect(statusForCategory(0, 0)).toBe("no_budget");
  });

  it("classifies a zero-budget category with spending as no_budget (unbudgeted spending), never overspent or healthy", () => {
    const status = statusForCategory(0, 500);
    expect(status).toBe("no_budget");
    expect(status).not.toBe("overspent");
    expect(status).not.toBe("healthy");
  });

  it("is healthy at 0% usage for a positive-budget, unused category", () => {
    expect(statusForCategory(1_000, 0)).toBe("healthy");
  });

  it("is no_budget for a negative budget too, regardless of spending", () => {
    expect(statusForCategory(-100, 500)).toBe("no_budget");
  });
});

describe("summarizeCategory", () => {
  it("returns null usagePercent when budgeted is zero (never divides by zero)", () => {
    const summary = summarizeCategory("อาหาร", 0, 0);
    expect(summary.usagePercent).toBeNull();
    expect(Number.isFinite(summary.usagePercent as number)).toBe(false); // null, not NaN/Infinity
  });

  it("computes remaining as budgeted minus spent, allowing negative", () => {
    const summary = summarizeCategory("อาหาร", 1_000, 1_500);
    expect(summary.remainingSatang).toBe(-500);
  });

  it("sets overspentSatang for a positive budget that was exceeded, and unbudgetedSpentSatang stays 0", () => {
    const summary = summarizeCategory("อาหาร", 1_000, 1_500);
    expect(summary.status).toBe("overspent");
    expect(summary.overspentSatang).toBe(500);
    expect(summary.unbudgetedSpentSatang).toBe(0);
  });

  it("sets unbudgetedSpentSatang for a zero-budget category with spending, and overspentSatang stays 0", () => {
    const summary = summarizeCategory("เดินทาง", 0, 843_96);
    expect(summary.status).toBe("no_budget");
    expect(summary.unbudgetedSpentSatang).toBe(843_96);
    expect(summary.overspentSatang).toBe(0);
  });

  it("has both overspentSatang and unbudgetedSpentSatang at 0 for a healthy positive-budget category", () => {
    const summary = summarizeCategory("อาหาร", 1_000, 500);
    expect(summary.overspentSatang).toBe(0);
    expect(summary.unbudgetedSpentSatang).toBe(0);
  });
});

describe("buildBudgetSummary", () => {
  it("reports hasBudget=false and zeroed totals when no budget exists for the month", () => {
    const summary = buildBudgetSummary("2026-07", null, [], []);
    expect(summary.hasBudget).toBe(false);
    expect(summary.expectedIncomeSatang).toBe(0);
    expect(summary.plannedTotalSatang).toBe(0);
    expect(summary.status).toBe("no_budget");
  });

  it("computes plannedTotal, spentTotal, remainingTotal, and unallocatedIncome correctly", () => {
    const summary = buildBudgetSummary(
      "2026-07",
      budget({ incomeSatang: 10_000 }),
      [category({ label: "อาหาร", amountSatang: 3_000 }), category({ id: "cat-2", label: "เดินทาง", amountSatang: 2_000 })],
      [tx({ type: "expense", category: "อาหาร", amountSatang: 1_000 })],
    );
    expect(summary.plannedTotalSatang).toBe(5_000);
    expect(summary.spentTotalSatang).toBe(1_000);
    expect(summary.remainingTotalSatang).toBe(4_000);
    expect(summary.unallocatedIncomeSatang).toBe(5_000); // 10,000 income - 5,000 planned
  });

  it("surfaces a category without a budget row (spend exists, no budget_categories row)", () => {
    const summary = buildBudgetSummary(
      "2026-07",
      budget(),
      [], // no budget categories created
      [tx({ type: "expense", category: "เดินทาง", amountSatang: 500 })],
    );
    const uncategorizedBudgetRow = summary.categories.find((c) => c.label === "เดินทาง");
    expect(uncategorizedBudgetRow).toBeDefined();
    expect(uncategorizedBudgetRow?.budgetCategoryId).toBeUndefined();
    expect(uncategorizedBudgetRow?.budgetedSatang).toBe(0);
    expect(uncategorizedBudgetRow?.spentSatang).toBe(500);
    expect(uncategorizedBudgetRow?.status).toBe("no_budget"); // zero budget + spending -- unbudgeted, not overspent
  });

  it("computes overspentTotalSatang only from categories with a positive budget that was actually exceeded", () => {
    const summary = buildBudgetSummary(
      "2026-07",
      budget(),
      [category({ label: "อาหาร", amountSatang: 1_000 }), category({ id: "cat-2", label: "เดินทาง", amountSatang: 5_000 })],
      [
        tx({ id: "a", type: "expense", category: "อาหาร", amountSatang: 1_500 }), // 500 over
        tx({ id: "b", type: "expense", category: "เดินทาง", amountSatang: 1_000 }), // under budget
      ],
    );
    expect(summary.overspentTotalSatang).toBe(500);
  });

  it("Issue 2 regression: zero-budget category with spending is unbudgeted, overspentTotalSatang stays 0, unbudgetedSpentTotalSatang equals the spend", () => {
    const summary = buildBudgetSummary(
      "2026-07",
      budget({ incomeSatang: 5_000_00 }),
      [], // no category budget configured at all
      [tx({ type: "expense", category: "อื่น ๆ", amountSatang: 843_96 })],
    );
    const category = summary.categories.find((c) => c.label === "อื่น ๆ");
    expect(category?.status).toBe("no_budget");
    expect(summary.overspentTotalSatang).toBe(0);
    expect(summary.unbudgetedSpentTotalSatang).toBe(843_96);
  });

  it("Issue 3 regression: income stays understandable as unallocated while overspent stays 0 and unbudgeted spend is reported separately", () => {
    const summary = buildBudgetSummary(
      "2026-07",
      budget({ incomeSatang: 5_000_00 }),
      [], // no category budget assigned
      [tx({ type: "expense", category: "อื่น ๆ", amountSatang: 843_96 })],
    );
    expect(summary.expectedIncomeSatang).toBe(5_000_00);
    expect(summary.plannedTotalSatang).toBe(0);
    expect(summary.unallocatedIncomeSatang).toBe(5_000_00); // income - 0 planned = still 5,000
    expect(summary.spentTotalSatang).toBe(843_96);
    expect(summary.overspentTotalSatang).toBe(0);
    expect(summary.unbudgetedSpentTotalSatang).toBe(843_96);
  });

  it("mixed categories: one real overspend and one zero-budget spend are kept separate in the totals", () => {
    const summary = buildBudgetSummary(
      "2026-07",
      budget({ incomeSatang: 10_000_00 }),
      [category({ label: "อาหาร", amountSatang: 1_000 })],
      [
        tx({ id: "a", type: "expense", category: "อาหาร", amountSatang: 1_500 }), // 500 over a positive budget
        tx({ id: "b", type: "expense", category: "เดินทาง", amountSatang: 700 }), // no budget row at all
      ],
    );
    const overspentCategory = summary.categories.find((c) => c.label === "อาหาร");
    const unbudgetedCategory = summary.categories.find((c) => c.label === "เดินทาง");
    expect(overspentCategory?.status).toBe("overspent");
    expect(overspentCategory?.overspentSatang).toBe(500);
    expect(unbudgetedCategory?.status).toBe("no_budget");
    expect(unbudgetedCategory?.unbudgetedSpentSatang).toBe(700);
    expect(summary.overspentTotalSatang).toBe(500);
    expect(summary.unbudgetedSpentTotalSatang).toBe(700);
  });

  it("never produces a negative-zero remainingTotalSatang or unallocatedIncomeSatang when income exactly matches planned spend", () => {
    const summary = buildBudgetSummary(
      "2026-07",
      budget({ incomeSatang: 1_000 }),
      [category({ label: "อาหาร", amountSatang: 1_000 })],
      [tx({ type: "expense", category: "อาหาร", amountSatang: 1_000 })],
    );
    expect(Object.is(summary.remainingTotalSatang, -0)).toBe(false);
    expect(Object.is(summary.unallocatedIncomeSatang, -0)).toBe(false);
    expect(formatTHB(summary.remainingTotalSatang)).toBe("฿0");
  });
});
