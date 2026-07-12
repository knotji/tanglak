import { describe, expect, it } from "vitest";
import { extractedFinancialDocumentSchema } from "@/lib/ai/schemas";
import {
  applyDebtPayment,
  calculateCashRemaining,
  calculateMonthlyTotals,
  daysUntilDue,
  debtCycleStatus,
  deliveryTotalPaidSatang,
  isFullCyclePaid,
  isMinimumPaid,
  isOverdue,
  isOwnAccountTransfer,
  remainingToMinimum,
  salaryNetIncomeSatang,
  shouldCountAsLivingExpense,
} from "@/lib/finance/calculations";
import { findDuplicateCandidates } from "@/lib/finance/duplicates";
import { bahtToSatang, formatTHB, satangToBaht } from "@/lib/finance/money";
import type { Account, Debt, Transaction } from "@/types/domain";

const baseDebt: Debt = {
  id: "debt",
  userId: "user",
  name: "KTC",
  debtType: "credit_card",
  paymentMode: "variable_monthly",
  minimumPaymentSatang: 320_000,
  amountDueSatang: 820_000,
  amountPaidThisCycleSatang: 150_000,
  dueDate: "2026-07-18",
  status: "active",
};

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: "tx",
  userId: "user",
  type: "expense",
  status: "confirmed",
  amountSatang: 10_000,
  currency: "THB",
  occurredAt: "2026-07-10T12:00:00+07:00",
  source: "manual",
  ...overrides,
});

describe("money helpers", () => {
  it("converts baht to satang without floating point drift", () => {
    expect(bahtToSatang("1,234.50")).toBe(123_450);
    expect(satangToBaht(123_450)).toBe(1234.5);
    expect(formatTHB(38_920_00)).toContain("38,920");
  });

  it("formats negative zero as zero and only shows positive sign when asked", () => {
    expect(formatTHB(-0)).toBe("฿0");
    expect(formatTHB(0, { showPositiveSign: true })).toBe("฿0");
    expect(formatTHB(12500, { showPositiveSign: true })).toBe("+฿125");
  });
});

describe("monthly totals", () => {
  it("counts only confirmed records and excludes transfers from cash remaining", () => {
    const totals = calculateMonthlyTotals(
      [
        tx({ id: "income", type: "income", amountSatang: 100_000 }),
        tx({ id: "expense", type: "expense", amountSatang: 30_000 }),
        tx({ id: "debt", type: "debt_payment", amountSatang: 20_000 }),
        tx({ id: "transfer", type: "transfer", amountSatang: 500_000 }),
        tx({ id: "draft", status: "needs_review", amountSatang: 1_000 }),
      ],
      "2026-07",
    );

    expect(totals.incomeSatang).toBe(100_000);
    expect(totals.livingExpenseSatang).toBe(30_000);
    expect(totals.debtPaymentSatang).toBe(20_000);
    expect(totals.transferSatang).toBe(500_000);
    expect(totals.cashRemainingSatang).toBe(50_000);
    expect(totals.unreviewedCount).toBe(1);
  });
});

describe("calculateCashRemaining — the shared income-consistency selector", () => {
  it("uses the passed-in planned (saved) income, not any income figure derived from transactions", () => {
    // Regression for Issue 1: Overview must never fall back to actual
    // income-type transactions when the canonical saved monthly income
    // (Budget page) is what every page is supposed to agree on. Here the
    // month has zero actual income transactions, matching the reported
    // bug (Budget saved ฿5,000, Overview showed ฿0).
    const totals = calculateMonthlyTotals(
      [tx({ type: "expense", amountSatang: 1_000_00 })],
      "2026-07",
    );
    expect(totals.incomeSatang).toBe(0); // no income transaction recorded this month

    const cashRemaining = calculateCashRemaining(5_000_00, totals);
    expect(cashRemaining).toBe(5_000_00 - 1_000_00);
  });

  it("still includes refunds and excludes nothing else from the formula", () => {
    const totals = calculateMonthlyTotals(
      [
        tx({ id: "expense", type: "expense", amountSatang: 1_000_00 }),
        tx({ id: "debt", type: "debt_payment", amountSatang: 500_00 }),
        tx({ id: "refund", type: "refund", amountSatang: 200_00 }),
      ],
      "2026-07",
    );
    const cashRemaining = calculateCashRemaining(10_000_00, totals);
    expect(cashRemaining).toBe(10_000_00 + 200_00 - 1_000_00 - 500_00);
  });

  it("does not produce a negative zero when planned income exactly covers spending", () => {
    const totals = calculateMonthlyTotals([tx({ type: "expense", amountSatang: 5_000_00 })], "2026-07");
    const cashRemaining = calculateCashRemaining(5_000_00, totals);
    expect(Object.is(cashRemaining, -0)).toBe(false);
    expect(formatTHB(cashRemaining)).toBe("฿0");
  });
});

describe("debt calculations", () => {
  it("keeps minimum and full amount separate", () => {
    expect(remainingToMinimum(baseDebt)).toBe(170_000);
    expect(applyDebtPayment(baseDebt, 170_000).amountPaidThisCycleSatang).toBe(320_000);
    expect(isMinimumPaid(applyDebtPayment(baseDebt, 170_000))).toBe(true);
    expect(isFullCyclePaid(applyDebtPayment(baseDebt, 170_000))).toBe(false);
    expect(isFullCyclePaid(applyDebtPayment(baseDebt, 670_000))).toBe(true);
  });

  it("calculates due days and overdue state", () => {
    expect(daysUntilDue("2026-07-18", new Date("2026-07-10T00:00:00Z"))).toBe(8);
    expect(isOverdue(baseDebt, new Date("2026-07-19T00:00:00Z"))).toBe(true);
  });

  it("uses Bangkok calendar dates for due-today and overdue status", () => {
    expect(daysUntilDue("2026-07-18", new Date("2026-07-17T17:30:00Z"))).toBe(0);
    expect(debtCycleStatus(baseDebt, new Date("2026-07-17T17:30:00Z"))).toBe("due_today");
    expect(debtCycleStatus(baseDebt, new Date("2026-07-18T17:30:00Z"))).toBe("overdue");
  });

  it("does not treat missing minimum or amount-due fields as paid", () => {
    const missingTargets = {
      ...baseDebt,
      minimumPaymentSatang: undefined,
      amountDueSatang: undefined,
      amountPaidThisCycleSatang: 0,
    };
    expect(isMinimumPaid(missingTargets)).toBe(false);
    expect(isFullCyclePaid(missingTargets)).toBe(false);
    expect(debtCycleStatus(missingTargets, new Date("2026-07-11T12:00:00+07:00"))).toBe("due_soon");
  });
});

describe("classification safeguards", () => {
  it("does not count credit card bill payment as living expense", () => {
    expect(shouldCountAsLivingExpense(tx({ type: "debt_payment" }))).toBe(false);
    expect(shouldCountAsLivingExpense(tx({ type: "expense" }))).toBe(true);
  });

  it("detects transfer between owned accounts", () => {
    const accounts: Account[] = [
      { id: "a", name: "บัญชี A", isOwnedByUser: true },
      { id: "b", name: "บัญชี B", isOwnedByUser: true },
    ];
    expect(
      isOwnAccountTransfer(tx({ type: "transfer", sourceAccountId: "a", destinationAccountId: "b" }), accounts),
    ).toBe(true);
  });
});

describe("document extraction math", () => {
  it("uses salary net income as cash-flow amount", () => {
    expect(salaryNetIncomeSatang({ grossIncomeSatang: 42_500_00, netIncomeSatang: 38_920_00 })).toBe(38_920_00);
  });

  it("uses delivery final paid amount after discount", () => {
    expect(
      deliveryTotalPaidSatang({
        subtotalSatang: 22_000,
        deliveryFeeSatang: 2_500,
        discountSatang: 6_000,
      }),
    ).toBe(18_500);
  });
});

describe("duplicate scoring", () => {
  it("scores exact reference matches very high", () => {
    const candidates = findDuplicateCandidates(
      tx({ id: "new", referenceNumber: "ABC", merchant: "GrabFood" }),
      [tx({ id: "old", referenceNumber: "ABC", merchant: "GrabFood" })],
    );
    expect(candidates[0]?.score).toBe(100);
  });
});

describe("AI response validation", () => {
  it("requires review for all parsed AI output", () => {
    const parsed = extractedFinancialDocumentSchema.parse({
      documentType: "receipt",
      confidence: 0.82,
      transaction: { type: "expense", amount: 189, currency: "THB", occurredAt: "2026-07-10T12:00:00+07:00" },
      warnings: [],
      unclearFields: [],
      requiresReview: true,
    });
    expect(parsed.requiresReview).toBe(true);
  });

  it("rejects malformed AI confidence", () => {
    expect(() =>
      extractedFinancialDocumentSchema.parse({
        documentType: "receipt",
        confidence: 2,
        warnings: [],
        unclearFields: [],
        requiresReview: true,
      }),
    ).toThrow();
  });
});
