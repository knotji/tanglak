import { describe, expect, it } from "vitest";
import { calculateCashRemaining, calculateMonthlyTotals } from "@/lib/finance/calculations";
import {
  buildBudgetSummary,
  calculateCategorySpend,
  summarizeCategory,
} from "@/lib/finance/budget-calculations";
import {
  DEFAULT_EXPENSE_CATEGORY_ID,
  DEFAULT_INCOME_CATEGORY_ID,
  getCategoryById,
  listBudgetableExpenseCategories,
  resolveCategoryFromLegacyLabel,
} from "@/lib/finance/categories";
import { budget, budgetCategory, JULY_2026, tx } from "./financial-integrity-fixtures";

const food = getCategoryById("food")!;
const transport = getCategoryById("transport")!;
const debtCategory = getCategoryById("debt")!;
const salary = getCategoryById("salary")!;

describe("planned income, actual income, expenses, debt payments, and transfers stay separate", () => {
  it("planned cash remaining uses planned income while actual income remains a separate total", () => {
    const transactions = [
      tx({ id: "income-a", type: "income", amountSatang: 80_000, category: salary.label }),
      tx({ id: "income-b", type: "income", amountSatang: 20_000, category: salary.label }),
      tx({ id: "adjacent-income", type: "income", amountSatang: 999_000, occurredAt: "2026-06-30T16:59:59.999Z", category: salary.label }),
      tx({ id: "expense", type: "expense", amountSatang: 30_000, category: food.label }),
      tx({ id: "debt-payment", type: "debt_payment", amountSatang: 10_000, category: debtCategory.label, debtId: "debt-a" }),
    ];

    const totals = calculateMonthlyTotals(transactions, JULY_2026);
    const summary = buildBudgetSummary(JULY_2026, budget({ incomeSatang: 300_000 }), [], transactions);

    expect(totals.incomeSatang).toBe(100_000);
    expect(summary.expectedIncomeSatang).toBe(300_000);
    expect(calculateCashRemaining(summary.expectedIncomeSatang, totals)).toBe(260_000);
    expect(totals.cashRemainingSatang).toBe(60_000);
  });

  it("ordinary expense, debt payment, transfer, refund, and unreviewed transactions affect only their canonical buckets", () => {
    const transactions = [
      tx({ id: "expense", type: "expense", amountSatang: 20_000, category: food.label }),
      tx({ id: "debt-payment", type: "debt_payment", amountSatang: 15_000, category: debtCategory.label, debtId: "debt-a" }),
      tx({ id: "transfer", type: "transfer", amountSatang: 50_000, category: getCategoryById("transfers")!.label }),
      tx({ id: "refund", type: "refund", amountSatang: 5_000, category: food.label }),
      tx({ id: "needs-review", status: "needs_review", type: "expense", amountSatang: 99_000, category: food.label }),
    ];

    const totals = calculateMonthlyTotals(transactions, JULY_2026);
    const categorySpend = calculateCategorySpend(transactions, JULY_2026);
    const summary = buildBudgetSummary(JULY_2026, budget(), [budgetCategory({ label: food.label, amountSatang: 50_000 })], transactions);

    expect(totals).toMatchObject({
      livingExpenseSatang: 20_000,
      debtPaymentSatang: 15_000,
      transferSatang: 50_000,
      refundSatang: 5_000,
      unreviewedCount: 1,
    });
    expect(categorySpend.byLabel[food.label]).toBe(15_000);
    expect(summary.spentTotalSatang).toBe(30_000);
    expect(summary.categories.find((category) => category.label === debtCategory.label)?.spentSatang).toBe(15_000);
    expect(Number.isFinite(summary.spentTotalSatang)).toBe(true);
  });
});

describe("unbudgeted spending and budget category visibility", () => {
  it.each([
    ["not_set without budget row", undefined, 12_000, "no_budget", 12_000, 0, null],
    ["not_set with zero budget row", 0, 12_000, "no_budget", 12_000, 0, null],
    ["positive budget with no spending", 20_000, 0, "healthy", 0, 0, 20_000],
    ["positive budget under limit", 20_000, 10_000, "healthy", 0, 0, 10_000],
    ["positive budget near limit", 20_000, 16_000, "near_limit", 0, 0, 4_000],
    ["positive budget exact equality", 20_000, 20_000, "near_limit", 0, 0, 0],
    ["positive budget exceeded", 20_000, 20_001, "overspent", 0, 1, -1],
  ] as const)("%s", (_name, budgetedSatang, spentSatang, status, unbudgeted, overspent, remaining) => {
    const categories = budgetedSatang === undefined ? [] : [budgetCategory({ label: transport.label, amountSatang: budgetedSatang })];
    const summary = buildBudgetSummary(
      JULY_2026,
      budget(),
      categories,
      spentSatang > 0 ? [tx({ type: "expense", amountSatang: spentSatang, category: transport.label })] : [],
    );
    const row = summary.categories.find((category) => category.label === transport.label)!;

    expect(row.status).toBe(status);
    expect(row.unbudgetedSpentSatang).toBe(unbudgeted);
    expect(row.overspentSatang).toBe(overspent);
    expect(row.usagePercent).toBe(budgetedSatang && budgetedSatang > 0 ? spentSatang / budgetedSatang : null);
    if (remaining === null) {
      expect(row.budgetedSatang).toBeLessThanOrEqual(0);
    } else {
      expect(row.remainingSatang).toBe(remaining);
    }
  });

  it("a non-positive budget can never become overspent", () => {
    for (const budgetedSatang of [0, -100]) {
      const row = summarizeCategory(food.label, budgetedSatang, 50_000);
      expect(row.status).toBe("no_budget");
      expect(row.overspentSatang).toBe(0);
      expect(row.unbudgetedSpentSatang).toBe(50_000);
    }
  });

  it("shows categories with spending or budget once, using canonical labels and hiding empty categories", () => {
    const summary = buildBudgetSummary(
      JULY_2026,
      budget(),
      [
        budgetCategory({ id: "food-budget", label: "food", amountSatang: 20_000 }),
        budgetCategory({ id: "transport-budget", label: transport.label, amountSatang: 30_000 }),
      ],
      [
        tx({ id: "legacy-food", category: "food", amountSatang: 7_000 }),
        tx({ id: "canonical-food", category: food.label, amountSatang: 8_000 }),
      ],
    );

    expect(summary.categories.filter((category) => category.label === food.label)).toHaveLength(1);
    expect(summary.categories.find((category) => category.label === food.label)?.spentSatang).toBe(15_000);
    expect(summary.categories.find((category) => category.label === transport.label)?.spentSatang).toBe(0);
    expect(summary.categories.some((category) => category.label === getCategoryById("shopping")!.label)).toBe(false);
  });
});

describe("canonical category and legacy normalization", () => {
  it("normalizes aliases, preserves valid manual categories, and keeps expense and income catalogs distinct", () => {
    expect(resolveCategoryFromLegacyLabel(food.label)?.id).toBe("food");
    expect(resolveCategoryFromLegacyLabel("food")?.id).toBe("food");
    expect(resolveCategoryFromLegacyLabel("  FOOD  ")?.id).toBe("food");
    expect(resolveCategoryFromLegacyLabel(salary.label)?.id).toBe("salary");
    expect(resolveCategoryFromLegacyLabel("not-a-real-ai-category")).toBeUndefined();
    expect(getCategoryById(DEFAULT_EXPENSE_CATEGORY_ID)?.kind).toBe("expense");
    expect(getCategoryById(DEFAULT_INCOME_CATEGORY_ID)?.kind).toBe("income");
    expect(listBudgetableExpenseCategories().every((category) => category.kind === "expense" && category.budgetable)).toBe(true);
  });

  it("groups legacy and canonical labels into one budget row without merchant-rule duplication", () => {
    const summary = buildBudgetSummary(
      JULY_2026,
      budget(),
      [budgetCategory({ label: food.label, amountSatang: 50_000 })],
      [
        tx({ id: "manual-selected", merchant: "Same Merchant", category: food.label, amountSatang: 10_000 }),
        tx({ id: "legacy-alias", merchant: "Same Merchant", category: "food", amountSatang: 20_000 }),
      ],
    );

    expect(summary.categories).toHaveLength(1);
    expect(summary.categories[0]).toMatchObject({
      label: food.label,
      spentSatang: 30_000,
      budgetedSatang: 50_000,
    });
  });
});
