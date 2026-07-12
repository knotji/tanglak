import { describe, expect, it } from "vitest";
import { getBangkokDateOf, getBangkokMonthOf } from "@/lib/finance/date";
import { calculateMonthlyTotals } from "@/lib/finance/calculations";
import { buildBudgetSummary, calculateCategorySpend } from "@/lib/finance/budget-calculations";
import type { MonthlyBudget, Transaction } from "@/types/domain";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? "tx",
    userId: "user-a",
    type: "expense",
    status: "confirmed",
    amountSatang: 2_000, // ฿20
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
    incomeSatang: 500_000, // ฿5,000
    strategy: "minimum_first",
    status: "draft",
    createdAt: "2026-07-01T00:00:00+07:00",
    updatedAt: "2026-07-01T00:00:00+07:00",
    ...overrides,
  };
}

describe("getBangkokMonthOf / getBangkokDateOf — Issue 1 root cause", () => {
  it("resolves a UTC instant whose calendar date differs from its Bangkok date to the correct Bangkok month", () => {
    // 2026-07-01T00:15:00+07:00 (just after Bangkok midnight, start of July)
    // is 2026-06-30T17:15:00Z in UTC -- a naive string-prefix check on the
    // UTC string would see "2026-06" and miss this July transaction.
    const utcInstant = "2026-06-30T17:15:00.000Z";
    expect(getBangkokMonthOf(utcInstant)).toBe("2026-07");
    expect(getBangkokDateOf(utcInstant)).toBe("2026-07-01");
  });

  it("resolves an ordinary daytime UTC instant to the same-looking Bangkok date (sanity check)", () => {
    // 13:44 Bangkok = 06:44 UTC same calendar day -- both should agree.
    expect(getBangkokMonthOf("2026-07-05T06:44:00.000Z")).toBe("2026-07");
    expect(getBangkokDateOf("2026-07-05T06:44:00.000Z")).toBe("2026-07-05");
  });

  it("handles a +00:00 offset suffix the same as a Z suffix", () => {
    expect(getBangkokMonthOf("2026-06-30T17:15:00+00:00")).toBe("2026-07");
  });
});

describe("Issue 1 regression: one confirmed expense is counted identically by every canonical calculation", () => {
  const julyExpense = tx({ type: "expense", category: "อาหารและเครื่องดื่ม", amountSatang: 2_000, occurredAt: "2026-07-10T12:00:00+07:00" });

  it("calculateMonthlyTotals counts it as ฿20 living expense for July", () => {
    const totals = calculateMonthlyTotals([julyExpense], "2026-07");
    expect(totals.livingExpenseSatang).toBe(2_000);
  });

  it("calculateCategorySpend counts it as ฿20 under its category for July", () => {
    const spend = calculateCategorySpend([julyExpense], "2026-07");
    expect(spend.byLabel["อาหารและเครื่องดื่ม"]).toBe(2_000);
  });

  it("buildBudgetSummary (the Budget/Overview/Today canonical source) counts it as ฿20 spent, with no category budget configured", () => {
    const summary = buildBudgetSummary("2026-07", budget(), [], [julyExpense]);
    expect(summary.spentTotalSatang).toBe(2_000);
    const foodCategory = summary.categories.find((c) => c.label === "อาหารและเครื่องดื่ม");
    expect(foodCategory?.spentSatang).toBe(2_000);
    expect(foodCategory?.status).toBe("no_budget");
    expect(foodCategory?.unbudgetedSpentSatang).toBe(2_000);
    expect(foodCategory?.overspentSatang).toBe(0);
    // Matches the required manual production-like check: planned income
    // ฿5,000, no category budget, ฿20 unbudgeted spend, ฿0 overspent.
    expect(summary.expectedIncomeSatang).toBe(500_000);
    expect(summary.overspentTotalSatang).toBe(0);
    expect(summary.unbudgetedSpentTotalSatang).toBe(2_000);
  });

  it("still counts the same when occurredAt is returned in raw UTC form (Supabase's actual response shape), not a literal +07:00 string", () => {
    // Bangkok 2026-07-10T12:00:00+07:00 == UTC 2026-07-10T05:00:00Z.
    const utcFormExpense = tx({ occurredAt: "2026-07-10T05:00:00.000Z", category: "อาหารและเครื่องดื่ม" });
    const totals = calculateMonthlyTotals([utcFormExpense], "2026-07");
    const summary = buildBudgetSummary("2026-07", budget(), [], [utcFormExpense]);
    expect(totals.livingExpenseSatang).toBe(2_000);
    expect(summary.spentTotalSatang).toBe(2_000);
  });

  it("a transaction just after Bangkok midnight (UTC previous day) is still counted in the correct Bangkok month, not dropped", () => {
    // 2026-07-01T00:15 Bangkok == 2026-06-30T17:15Z.
    const midnightExpense = tx({ occurredAt: "2026-06-30T17:15:00.000Z", category: "อาหารและเครื่องดื่ม" });
    const totals = calculateMonthlyTotals([midnightExpense], "2026-07");
    expect(totals.livingExpenseSatang).toBe(2_000);
    const juneTotals = calculateMonthlyTotals([midnightExpense], "2026-06");
    expect(juneTotals.livingExpenseSatang).toBe(0);
  });
});

describe("legacy category normalization does not create duplicate category rows (Issue 8)", () => {
  it("a legacy-labeled budget row still matches spend from a canonically-labeled transaction", () => {
    const summary = buildBudgetSummary(
      "2026-07",
      budget(),
      [{ id: "cat-1", userId: "user-a", monthlyBudgetId: "budget-1", label: "อาหาร", amountSatang: 100_00, createdAt: "2026-07-01T00:00:00+07:00", updatedAt: "2026-07-01T00:00:00+07:00" }],
      [tx({ category: "อาหารและเครื่องดื่ม", amountSatang: 2_000 })],
    );
    expect(summary.categories).toHaveLength(1);
    expect(summary.categories[0].label).toBe("อาหารและเครื่องดื่ม");
    expect(summary.categories[0].spentSatang).toBe(2_000);
    expect(summary.categories[0].budgetedSatang).toBe(100_00);
  });
});
