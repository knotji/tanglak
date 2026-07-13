import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDebt,
  createImportBatch,
  createImportRows,
  createTransaction,
  deleteTransaction,
  importReviewedRows,
} from "@/lib/data/finance-repository";
import { getMockState } from "@/lib/data/mock-store";
import { calculateMonthlyTotals } from "@/lib/finance/calculations";
import { buildBudgetSummary } from "@/lib/finance/budget-calculations";
import { getCategoryById } from "@/lib/finance/categories";
import { simulateDebtPayment } from "@/lib/debt/payment-simulator";
import { generatePlanOptions } from "@/lib/debt/payment-recommendation";
import { budget, budgetCategory, JULY_2026, OTHER_USER_ID, resetMockFinanceState, tx, USER_ID } from "./financial-integrity-fixtures";
import type { ImportRow } from "@/types/domain";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...original, isMockAuthEnabled: () => true };
});

const food = getCategoryById("food")!;
const debtCategory = getCategoryById("debt")!;
const transferCategory = getCategoryById("transfers")!;

beforeEach(() => {
  resetMockFinanceState();
});

function rowInput(overrides: Partial<ImportRow> = {}): Omit<ImportRow, "id" | "createdAt" | "updatedAt"> {
  return {
    userId: USER_ID,
    importBatchId: "batch-placeholder",
    sourceRowIndex: 0,
    occurredAt: "2026-07-10T12:00:00+07:00",
    description: "Fictional Import",
    merchant: "Fictional Merchant",
    amountSatang: 12_345,
    direction: "debit",
    currency: "THB",
    duplicateScore: 0,
    reviewStatus: "ready",
    importDecision: "unresolved",
    validationWarnings: [],
    parserSource: "deterministic",
    ...overrides,
  };
}

describe("source equivalence and exact idempotency", () => {
  it("manual, slip-like, and CSV/history-import transactions produce equivalent financial totals", async () => {
    const manual = await createTransaction(USER_ID, {
      type: "expense",
      amountSatang: 12_345,
      occurredAt: "2026-07-10T12:00:00+07:00",
      category: food.label,
      merchant: "Manual Cafe",
      source: "manual",
    });
    const slip = await createTransaction(USER_ID, {
      type: "expense",
      amountSatang: 12_345,
      occurredAt: "2026-07-10T12:00:00+07:00",
      category: food.label,
      merchant: "Slip Cafe",
      source: "receipt",
      documentId: "fictional-document",
    });

    const batch = await createImportBatch(USER_ID, {
      sourceType: "generic_csv",
      storagePath: `${USER_ID}/history-imports/fictional.csv`,
      mimeType: "text/csv",
      fileSize: 100,
    });
    const [row] = await createImportRows(USER_ID, [rowInput({ importBatchId: batch.id, suggestedCategory: food.label })]);
    await importReviewedRows(USER_ID, batch.id, undefined, [
      { rowId: row.id, decision: "import", amountSatang: 12_345, category: food.label },
    ]);

    const transactions = getMockState().transactions.filter(
      (transaction) =>
        transaction.id === manual.id ||
        transaction.id === slip.id ||
        transaction.importRowId === row.id,
    );
    const totals = calculateMonthlyTotals(transactions, JULY_2026);
    const summary = buildBudgetSummary(JULY_2026, budget(), [], transactions);

    expect(totals.livingExpenseSatang).toBe(37_035);
    expect(summary.spentTotalSatang).toBe(37_035);
    expect(new Set(transactions.map((transaction) => transaction.source))).toEqual(new Set(["manual", "receipt", "history_import"]));
  });

  it("retrying the same import row never creates a second financial effect, while separate same-amount rows remain legitimate", async () => {
    const batch = await createImportBatch(USER_ID, {
      sourceType: "generic_csv",
      storagePath: `${USER_ID}/history-imports/retry.csv`,
      mimeType: "text/csv",
      fileSize: 100,
    });
    const rows = await createImportRows(USER_ID, [
      rowInput({ importBatchId: batch.id, sourceRowIndex: 0, amountSatang: 50_000 }),
      rowInput({ importBatchId: batch.id, sourceRowIndex: 1, amountSatang: 50_000 }),
    ]);

    await importReviewedRows(USER_ID, batch.id, undefined, [
      { rowId: rows[0].id, decision: "import", amountSatang: 50_000, category: food.label },
    ]);
    await importReviewedRows(USER_ID, batch.id, undefined, [
      { rowId: rows[0].id, decision: "import", amountSatang: 50_000, category: food.label },
      { rowId: rows[1].id, decision: "import", amountSatang: 50_000, category: food.label },
    ]);

    const imported = getMockState().transactions.filter((transaction) => transaction.importBatchId === batch.id);
    expect(imported).toHaveLength(2);
    expect(calculateMonthlyTotals(imported, JULY_2026).livingExpenseSatang).toBe(100_000);
  });
});

describe("Debt Payment Simulator integration invariants", () => {
  it("uses canonical finance context and does not subtract the simulated debt payment twice", () => {
    const transactions = [
      tx({ id: "expense", type: "expense", amountSatang: 120_000, category: food.label }),
      tx({ id: "target-debt-payment", type: "debt_payment", amountSatang: 20_000, category: debtCategory.label, debtId: "target-debt" }),
      tx({ id: "other-debt-payment", type: "debt_payment", amountSatang: 30_000, category: debtCategory.label, debtId: "other-debt" }),
      tx({ id: "transfer", type: "transfer", amountSatang: 999_000, category: transferCategory.label }),
    ];
    const totals = calculateMonthlyTotals(transactions, JULY_2026);
    const plannedIncomeSatang = 500_000;

    const result = simulateDebtPayment({
      balanceSatang: 300_000,
      minimumPaymentSatang: 50_000,
      paymentAmountSatang: 50_000,
      interestRatePercent: 0,
      interestRatePeriod: "annual",
      dueDate: "2026-07-25",
      extraPaymentBehavior: "unknown",
      plannedIncomeSatang,
      currentMonthSpendingSatang: totals.livingExpenseSatang,
      debtPaymentsThisMonthSatang: totals.debtPaymentSatang - 20_000,
      minimumCashReserveSatang: 0,
      safeBufferSatang: 0,
    });

    expect(totals.transferSatang).toBe(999_000);
    expect(result.cashRemainingAfterPaymentSatang).toBe(300_000);
    expect(result.interestSavedVsMinimumSatang).toBeNull();
    expect(result.estimatedPayoffDate).toBeNull();
  });

  it("returns insufficient data without planned income and no safe recommendation when minimum is unaffordable", () => {
    expect(
      simulateDebtPayment({
        balanceSatang: 300_000,
        minimumPaymentSatang: 50_000,
        paymentAmountSatang: 50_000,
        interestRatePercent: 0,
        interestRatePeriod: "annual",
        extraPaymentBehavior: "reduce_principal",
        currentMonthSpendingSatang: 10_000,
        debtPaymentsThisMonthSatang: 0,
      }).affordabilityStatus,
    ).toBe("insufficient_data");

    const plans = generatePlanOptions({
      balanceSatang: 300_000,
      minimumPaymentSatang: 50_000,
      interestRatePercent: 0,
      interestRatePeriod: "annual",
      extraPaymentBehavior: "reduce_principal",
      plannedIncomeSatang: 40_000,
      currentMonthSpendingSatang: 30_000,
      debtPaymentsThisMonthSatang: 0,
      minimumCashReserveSatang: 20_000,
      safeBufferSatang: 0,
    });

    expect(plans.recommendedAmountSatang).toBeNull();
    expect(plans.minimum.shortfallSatang).toBe(50_000);
  });
});

describe("delete and removal restoration", () => {
  it("removing one transaction reverses exactly that financial effect and leaves other users untouched", async () => {
    const state = getMockState();
    state.monthlyBudgets.push(budget());
    state.budgetCategories.push(budgetCategory({ label: food.label, amountSatang: 50_000 }));

    const removable = await createTransaction(USER_ID, {
      type: "expense",
      amountSatang: 20_000,
      occurredAt: "2026-07-10T12:00:00+07:00",
      category: food.label,
    });
    const survivor = await createTransaction(USER_ID, {
      type: "expense",
      amountSatang: 10_000,
      occurredAt: "2026-07-10T13:00:00+07:00",
      category: food.label,
    });
    const otherUserTx = await createTransaction(OTHER_USER_ID, {
      type: "expense",
      amountSatang: 99_000,
      occurredAt: "2026-07-10T13:00:00+07:00",
      category: food.label,
    });

    expect(buildBudgetSummary(JULY_2026, budget(), [budgetCategory({ label: food.label, amountSatang: 50_000 })], state.transactions.filter((item) => item.userId === USER_ID)).spentTotalSatang).toBe(30_000);

    await expect(deleteTransaction(OTHER_USER_ID, removable.id)).rejects.toThrow("Cannot access another user's data");
    await deleteTransaction(USER_ID, removable.id);
    await expect(deleteTransaction(USER_ID, removable.id)).resolves.toBeUndefined();

    const remainingUserTransactions = state.transactions.filter((item) => item.userId === USER_ID);
    expect(remainingUserTransactions.map((item) => item.id)).toEqual([survivor.id]);
    expect(state.transactions.some((item) => item.id === otherUserTx.id)).toBe(true);
    expect(buildBudgetSummary(JULY_2026, budget(), [budgetCategory({ label: food.label, amountSatang: 50_000 })], remainingUserTransactions).spentTotalSatang).toBe(10_000);
  });

  it("a no-budget category disappears from the summary after its only transaction is deleted", async () => {
    const created = await createTransaction(USER_ID, {
      type: "expense",
      amountSatang: 20_000,
      occurredAt: "2026-07-10T12:00:00+07:00",
      category: food.label,
    });

    expect(buildBudgetSummary(JULY_2026, budget(), [], getMockState().transactions).categories).toHaveLength(1);
    await deleteTransaction(USER_ID, created.id);
    expect(buildBudgetSummary(JULY_2026, budget(), [], getMockState().transactions).categories).toHaveLength(0);
  });

  it("deleting a debt payment recalculates the linked debt paid-this-cycle total", async () => {
    const createdDebt = await createDebt(USER_ID, {
      name: "Fictional Card",
      amountDueSatang: 100_000,
      minimumPaymentSatang: 50_000,
      dueDate: "2026-07-25",
    });
    const payment = await createTransaction(USER_ID, {
      type: "debt_payment",
      amountSatang: 20_000,
      occurredAt: "2026-07-10T12:00:00+07:00",
      category: debtCategory.label,
      debtId: createdDebt.id,
    });

    expect(getMockState().debts.find((item) => item.id === createdDebt.id)?.amountPaidThisCycleSatang).toBe(20_000);
    await deleteTransaction(USER_ID, payment.id);
    expect(getMockState().debts.find((item) => item.id === createdDebt.id)?.amountPaidThisCycleSatang).toBe(0);
  });
});
