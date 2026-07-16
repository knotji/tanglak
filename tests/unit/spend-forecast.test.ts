import { describe, expect, it } from "vitest";
import { buildBudgetSummary, type BudgetSummary } from "@/lib/finance/budget-calculations";
import { buildSpendForecast } from "@/lib/finance/spend-forecast";
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
    category: "อาหาร",
    ...overrides,
  };
}

function budget(overrides: Partial<MonthlyBudget> = {}): MonthlyBudget {
  return {
    id: "budget-1",
    userId: "user-a",
    month: "2026-07",
    incomeSatang: 500_000,
    strategy: "minimum_first",
    status: "draft",
    createdAt: "2026-07-01T00:00:00+07:00",
    updatedAt: "2026-07-01T00:00:00+07:00",
    ...overrides,
  };
}

function category(overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: overrides.id ?? "cat-1",
    userId: "user-a",
    monthlyBudgetId: "budget-1",
    label: "อาหาร",
    amountSatang: 30_000,
    createdAt: "2026-07-01T00:00:00+07:00",
    updatedAt: "2026-07-01T00:00:00+07:00",
    ...overrides,
  };
}

function summary(
  transactions: Transaction[],
  overrides: {
    budget?: MonthlyBudget | null;
    categories?: BudgetCategory[];
    month?: string;
  } = {},
): BudgetSummary {
  const month = overrides.month ?? "2026-07";
  return buildBudgetSummary(
    month,
    overrides.budget === undefined ? budget({ month }) : overrides.budget,
    overrides.categories ?? [category({ amountSatang: 30_000 })],
    transactions,
  );
}

describe("buildSpendForecast", () => {
  it("projects month-end spend from the trailing calendar-day burn rate", () => {
    const transactions = [
      tx({ id: "older", occurredAt: "2026-07-08T12:00:00+07:00", amountSatang: 50_000 }),
      tx({ id: "d1", occurredAt: "2026-07-09T12:00:00+07:00", amountSatang: 700 }),
      tx({ id: "d2", occurredAt: "2026-07-15T12:00:00+07:00", amountSatang: 700 }),
    ];
    const forecast = buildSpendForecast(
      transactions,
      summary(transactions, { categories: [category({ amountSatang: 53_000 })] }),
      "2026-07",
      "2026-07-15",
    );

    expect(forecast.isAvailable).toBe(true);
    expect(forecast.trailingWindowDaysUsed).toBe(7);
    expect(forecast.trailingSpendSatang).toBe(1_400);
    expect(forecast.averageDailySpendSatang).toBe(200);
    expect(forecast.remainingDaysInMonth).toBe(16);
    expect(forecast.projectedAdditionalSpendSatang).toBe(3_200);
    expect(forecast.projectedMonthEndSpendSatang).toBe(54_600);
    expect(forecast.projectedBudgetVarianceSatang).toBe(1_600); // 54600 - 53000 = 1600 (positive means over budget)
    expect(forecast.onTrackToExceedBudget).toBe(true);
  });

  it("uses floor rounding for average satang and keeps calendar days with no spend in the denominator", () => {
    const transactions = [tx({ id: "one", occurredAt: "2026-07-15T12:00:00+07:00", amountSatang: 1_000 })];
    const forecast = buildSpendForecast(transactions, summary(transactions), "2026-07", "2026-07-15");

    expect(forecast.isAvailable).toBe(true);
    expect(forecast.trailingWindowDaysUsed).toBe(7);
    expect(forecast.trailingSpendSatang).toBe(1_000);
    expect(forecast.averageDailySpendSatang).toBe(142); // floor(1000 / 7)
    expect(forecast.projectedAdditionalSpendSatang).toBe(2_272);
  });

  it("reduces the trailing window early in the month", () => {
    const transactions = [
      tx({ id: "day1", occurredAt: "2026-07-01T12:00:00+07:00", amountSatang: 900 }),
      tx({ id: "day3", occurredAt: "2026-07-03T12:00:00+07:00", amountSatang: 600 }),
    ];
    const forecast = buildSpendForecast(transactions, summary(transactions), "2026-07", "2026-07-03");

    expect(forecast.isAvailable).toBe(true);
    expect(forecast.trailingWindowDaysUsed).toBe(3);
    expect(forecast.trailingSpendSatang).toBe(1_500);
    expect(forecast.averageDailySpendSatang).toBe(500);
  });

  it("uses one day on the first day of the month", () => {
    const transactions = [tx({ occurredAt: "2026-07-01T12:00:00+07:00", amountSatang: 777 })];
    const forecast = buildSpendForecast(transactions, summary(transactions), "2026-07", "2026-07-01");

    expect(forecast.isAvailable).toBe(true);
    expect(forecast.trailingWindowDaysUsed).toBe(1);
    expect(forecast.trailingSpendSatang).toBe(777);
    expect(forecast.averageDailySpendSatang).toBe(777);
  });

  it("supports a custom trailing window and normalizes invalid windows to one day", () => {
    const transactions = [
      tx({ id: "day13", occurredAt: "2026-07-13T12:00:00+07:00", amountSatang: 1_000 }),
      tx({ id: "day15", occurredAt: "2026-07-15T12:00:00+07:00", amountSatang: 500 }),
    ];

    expect(buildSpendForecast(transactions, summary(transactions), "2026-07", "2026-07-15", 3).trailingSpendSatang).toBe(1_500);
    expect(buildSpendForecast(transactions, summary(transactions), "2026-07", "2026-07-15", 0).trailingWindowDaysUsed).toBe(1);
  });

  it("uses budget helper semantics for spend eligibility", () => {
    const transactions = [
      tx({ id: "expense", type: "expense", amountSatang: 1_000 }),
      tx({ id: "debt", type: "debt_payment", amountSatang: 800 }),
      tx({ id: "refund", type: "refund", amountSatang: 300 }),
      tx({ id: "income", type: "income", amountSatang: 99_999 }),
      tx({ id: "transfer", type: "transfer", amountSatang: 99_999 }),
      tx({ id: "draft", status: "draft", amountSatang: 99_999 }),
    ];
    const forecast = buildSpendForecast(transactions, summary(transactions), "2026-07", "2026-07-15");

    expect(forecast.trailingSpendSatang).toBe(1_500);
  });

  it("excludes future, prior-month, and next-month transactions", () => {
    const transactions = [
      tx({ id: "current", occurredAt: "2026-07-15T12:00:00+07:00", amountSatang: 1_000 }),
      tx({ id: "future", occurredAt: "2026-07-16T12:00:00+07:00", amountSatang: 9_000 }),
      tx({ id: "prior", occurredAt: "2026-06-30T12:00:00+07:00", amountSatang: 9_000 }),
      tx({ id: "next", occurredAt: "2026-08-01T12:00:00+07:00", amountSatang: 9_000 }),
    ];
    const forecast = buildSpendForecast(transactions, summary(transactions), "2026-07", "2026-07-15");

    expect(forecast.trailingSpendSatang).toBe(1_000);
  });

  it("honors Bangkok date boundaries around UTC midnight", () => {
    const transactions = [
      tx({ id: "bangkok-next-day", occurredAt: "2026-07-14T18:30:00.000Z", amountSatang: 1_000 }),
      tx({ id: "utc-next-month", occurredAt: "2026-06-30T18:30:00.000Z", amountSatang: 2_000 }),
      tx({ id: "bangkok-august", occurredAt: "2026-07-31T18:00:00.000Z", amountSatang: 9_000 }),
    ];
    const julySummary = summary(transactions);
    const forecast = buildSpendForecast(transactions, julySummary, "2026-07", "2026-07-15");

    expect(forecast.trailingSpendSatang).toBe(1_000);
    expect(julySummary.spentTotalSatang).toBe(3_000);
  });

  it("handles leap-year February and 30-day months", () => {
    const febTransactions = [tx({ occurredAt: "2028-02-29T12:00:00+07:00", amountSatang: 2_900 })];
    const febSummary = summary(febTransactions, {
      month: "2028-02",
      budget: budget({ month: "2028-02" }),
      categories: [category({ amountSatang: 10_000 })],
    });
    const aprilTransactions = [tx({ occurredAt: "2026-04-30T12:00:00+07:00", amountSatang: 3_000 })];
    const aprilSummary = summary(aprilTransactions, {
      month: "2026-04",
      budget: budget({ month: "2026-04" }),
      categories: [category({ amountSatang: 10_000 })],
    });

    expect(buildSpendForecast(febTransactions, febSummary, "2028-02", "2028-02-28").remainingDaysInMonth).toBe(1);
    expect(buildSpendForecast(aprilTransactions, aprilSummary, "2026-04", "2026-04-15").remainingDaysInMonth).toBe(15);
  });

  it("computes exhaustion date and days before month end when budget is projected to run out early", () => {
    const transactions = [tx({ occurredAt: "2026-07-15T12:00:00+07:00", amountSatang: 20_000 })];
    const forecast = buildSpendForecast(
      transactions,
      summary(transactions, { categories: [category({ amountSatang: 25_000 })] }),
      "2026-07",
      "2026-07-15",
      1,
    );

    expect(forecast.isAvailable).toBe(true);
    expect(forecast.remainingBudgetSatang).toBe(5_000);
    expect(forecast.projectedBudgetExhaustionDate).toBe("2026-07-16");
    expect(forecast.daysBeforeMonthEnd).toBe(15); // End of month is 2026-07-31, so 31 - 16 = 15 days before month end
  });

  it("returns null exhaustion date and daysBeforeMonthEnd when budget would last past month end", () => {
    const transactions = [tx({ occurredAt: "2026-07-15T12:00:00+07:00", amountSatang: 100 })];
    const forecast = buildSpendForecast(
      transactions,
      summary(transactions, { categories: [category({ amountSatang: 10_000 })] }),
      "2026-07",
      "2026-07-15",
      1,
    );

    expect(forecast.onTrackToExceedBudget).toBe(false);
    expect(forecast.projectedBudgetExhaustionDate).toBeNull();
    expect(forecast.daysBeforeMonthEnd).toBeNull();
  });

  it("returns isAvailable false and correct reasons for no budget, zero budget, and remaining <= 0", () => {
    const transactions = [tx({ occurredAt: "2026-07-15T12:00:00+07:00", amountSatang: 1_000 })];

    const fNoBudget = buildSpendForecast(transactions, summary(transactions, { budget: null, categories: [] }), "2026-07", "2026-07-15");
    expect(fNoBudget.isAvailable).toBe(false);
    expect(fNoBudget.unavailableReason).toBe("no_budget");

    const fZeroBudget = buildSpendForecast(transactions, summary(transactions, { categories: [category({ amountSatang: 0 })] }), "2026-07", "2026-07-15");
    expect(fZeroBudget.isAvailable).toBe(false);
    expect(fZeroBudget.unavailableReason).toBe("no_budget");

    const fExhaustedBudget = buildSpendForecast(transactions, summary(transactions, { categories: [category({ amountSatang: 500 })] }), "2026-07", "2026-07-15");
    expect(fExhaustedBudget.isAvailable).toBe(false);
    expect(fExhaustedBudget.unavailableReason).toBe("budget_exhausted");
  });

  it("handles exact budget boundaries and ±1 satang scenarios", () => {
    const transactions = [tx({ occurredAt: "2026-07-15T12:00:00+07:00", amountSatang: 1_000 })];

    const exact = buildSpendForecast(transactions, summary(transactions, { categories: [category({ amountSatang: 17_000 })] }), "2026-07", "2026-07-15", 1);
    expect(exact.projectedBudgetVarianceSatang).toBe(0);
    expect(exact.onTrackToExceedBudget).toBe(false);

    const under = buildSpendForecast(transactions, summary(transactions, { categories: [category({ amountSatang: 17_001 })] }), "2026-07", "2026-07-15", 1);
    expect(under.projectedBudgetVarianceSatang).toBe(-1);
    expect(under.onTrackToExceedBudget).toBe(false);

    const over = buildSpendForecast(transactions, summary(transactions, { categories: [category({ amountSatang: 16_999 })] }), "2026-07", "2026-07-15", 1);
    expect(over.projectedBudgetVarianceSatang).toBe(1);
    expect(over.onTrackToExceedBudget).toBe(true);
  });

  it("returns an unavailable forecast with invalid_period for invalid month/today mismatch", () => {
    const transactions = [tx({ amountSatang: 1_000 })];
    const forecast = buildSpendForecast(transactions, summary(transactions), "2026-07", "2026-08-01");

    expect(forecast.isAvailable).toBe(false);
    expect(forecast.unavailableReason).toBe("invalid_period");
    expect(forecast.onTrackToExceedBudget).toBe(false);
  });

  it("does not mutate transactions or budget summary", () => {
    const transactions = [tx({ amountSatang: 1_000 })];
    const budgetSummary = summary(transactions);
    const transactionsBefore = structuredClone(transactions);
    const summaryBefore = structuredClone(budgetSummary);

    buildSpendForecast(transactions, budgetSummary, "2026-07", "2026-07-15");

    expect(transactions).toEqual(transactionsBefore);
    expect(budgetSummary).toEqual(summaryBefore);
  });
});
