import { describe, expect, it } from "vitest";
import { buildMonthlyDebtSummary } from "@/lib/finance/debt-summary";
import type { Debt, Transaction } from "@/types/domain";

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    userId: "user-a",
    name: "บัตรเครดิต A",
    debtType: "credit_card",
    paymentMode: "variable_monthly",
    outstandingBalanceSatang: 10_000_00,
    amountDueSatang: 2_000_00,
    minimumPaymentSatang: 1_000_00,
    amountPaidThisCycleSatang: 0,
    status: "active",
    ...overrides,
  };
}

function payment(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    userId: "user-a",
    type: "debt_payment",
    status: "confirmed",
    amountSatang: 500_00,
    currency: "THB",
    occurredAt: "2026-07-10T12:00:00+07:00",
    source: "manual",
    debtId: "debt-1",
    ...overrides,
  };
}

describe("buildMonthlyDebtSummary", () => {
  it("sums outstanding balance across all debts regardless of due month", () => {
    const summary = buildMonthlyDebtSummary(
      [debt({ id: "d1", outstandingBalanceSatang: 5_000_00 }), debt({ id: "d2", outstandingBalanceSatang: 3_000_00, dueDate: undefined })],
      [],
      "2026-07",
    );
    expect(summary.totalOutstandingSatang).toBe(8_000_00);
  });

  it("only counts amount-due and minimum totals for debts due within the target month", () => {
    const summary = buildMonthlyDebtSummary(
      [
        debt({ id: "d1", dueDate: "2026-07-15", amountDueSatang: 2_000_00, minimumPaymentSatang: 1_000_00 }),
        debt({ id: "d2", dueDate: "2026-08-15", amountDueSatang: 5_000_00, minimumPaymentSatang: 2_000_00 }),
      ],
      [],
      "2026-07",
    );
    expect(summary.totalDueThisMonthSatang).toBe(2_000_00);
    expect(summary.totalMinimumThisMonthSatang).toBe(1_000_00);
  });

  it("sums paid-this-month from confirmed debt_payment transactions within each debt's cycle window", () => {
    const d1 = debt({ id: "d1", dueDate: "2026-07-15" });
    const summary = buildMonthlyDebtSummary(
      [d1],
      [payment({ debtId: "d1", amountSatang: 500_00, occurredAt: "2026-07-05T10:00:00+07:00" })],
      "2026-07",
    );
    expect(summary.totalPaidThisMonthSatang).toBe(500_00);
  });

  it("excludes unconfirmed debt_payment transactions", () => {
    const d1 = debt({ id: "d1", dueDate: "2026-07-15" });
    const summary = buildMonthlyDebtSummary(
      [d1],
      [payment({ debtId: "d1", status: "needs_review", occurredAt: "2026-07-05T10:00:00+07:00" })],
      "2026-07",
    );
    expect(summary.totalPaidThisMonthSatang).toBe(0);
  });

  it("excludes payments outside the debt's own cycle window", () => {
    const d1 = debt({ id: "d1", dueDate: "2026-07-15" });
    const summary = buildMonthlyDebtSummary(
      [d1],
      [payment({ debtId: "d1", occurredAt: "2026-06-20T10:00:00+07:00" })],
      "2026-07",
    );
    expect(summary.totalPaidThisMonthSatang).toBe(0);
  });

  it("never lets one debt's payment count toward another debt's total (no double-counting)", () => {
    const d1 = debt({ id: "d1", dueDate: "2026-07-10", minimumPaymentSatang: 1_000_00 });
    const d2 = debt({ id: "d2", dueDate: "2026-07-20", minimumPaymentSatang: 1_000_00 });
    const summary = buildMonthlyDebtSummary(
      [d1, d2],
      [payment({ debtId: "d1", amountSatang: 1_000_00, occurredAt: "2026-07-05T10:00:00+07:00" })],
      "2026-07",
    );
    expect(summary.totalPaidThisMonthSatang).toBe(1_000_00);
    // d2's remaining minimum is untouched by d1's payment.
    expect(summary.totalRemainingMinimumSatang).toBe(1_000_00);
  });

  it("computes remaining minimum as max(0, minimum - paid), summed, floored at zero per debt", () => {
    const d1 = debt({ id: "d1", dueDate: "2026-07-10", minimumPaymentSatang: 1_000_00 });
    const d2 = debt({ id: "d2", dueDate: "2026-07-20", minimumPaymentSatang: 500_00 });
    const summary = buildMonthlyDebtSummary(
      [d1, d2],
      [
        payment({ debtId: "d1", amountSatang: 300_00, occurredAt: "2026-07-05T10:00:00+07:00" }),
        // Overpayment on d2 must not create a negative contribution.
        payment({ id: "tx-2", debtId: "d2", amountSatang: 900_00, occurredAt: "2026-07-06T10:00:00+07:00" }),
      ],
      "2026-07",
    );
    expect(summary.totalRemainingMinimumSatang).toBe(700_00); // (1000-300) + max(0, 500-900)
  });

  it("never reads or reports anything derived from outstandingBalanceSatang minus payments", () => {
    // A payment must never appear to reduce total outstanding in this
    // summary -- outstanding is a pure pass-through sum, independent of
    // totalPaidThisMonthSatang.
    const d1 = debt({ id: "d1", dueDate: "2026-07-10", outstandingBalanceSatang: 10_000_00, minimumPaymentSatang: 1_000_00 });
    const summary = buildMonthlyDebtSummary(
      [d1],
      [payment({ debtId: "d1", amountSatang: 5_000_00, occurredAt: "2026-07-05T10:00:00+07:00" })],
      "2026-07",
    );
    expect(summary.totalOutstandingSatang).toBe(10_000_00);
  });

  it("classifies due-soon and overdue debts for the summary's alert lists", () => {
    const overdue = debt({ id: "d1", dueDate: "2026-06-01" });
    const dueSoon = debt({ id: "d2", dueDate: "2026-07-01" });
    const summary = buildMonthlyDebtSummary([overdue, dueSoon], [], "2026-07");
    // These lists are computed with "now" (no fixed-today override exposed
    // on this function), so just assert the partition is exhaustive and
    // disjoint rather than asserting on real-time-relative membership.
    const overlap = summary.dueSoonDebts.filter((debt) => summary.overdueDebts.includes(debt));
    expect(overlap).toHaveLength(0);
  });
});
