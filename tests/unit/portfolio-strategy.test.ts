import { describe, expect, it } from "vitest";
import {
  buildDebtPortfolioComparison,
  filterActiveDebts,
  orderByAvalanche,
  orderBySnowball,
} from "@/lib/debt/portfolio-strategy";
import type { Debt } from "@/types/domain";

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-a",
    userId: "user-a",
    name: "บัตรเครดิต A",
    debtType: "credit_card",
    paymentMode: "variable_monthly",
    outstandingBalanceSatang: 10_000_00,
    amountDueSatang: 1_000_00,
    minimumPaymentSatang: 1_000_00,
    amountPaidThisCycleSatang: 0,
    dueDate: "2026-07-20",
    interestRateAnnual: 18,
    status: "active",
    ...overrides,
  };
}

describe("debt portfolio strategy", () => {
  it("filters active debts only", () => {
    const active = debt({ id: "active" });
    const paidOff = debt({ id: "paid-off", status: "paid_off" });
    const paused = debt({ id: "paused", status: "paused" });

    expect(filterActiveDebts([paidOff, active, paused]).map((item) => item.id)).toEqual(["active"]);
  });

  it("orders snowball by smallest balance, then higher interest, due date, and id", () => {
    const input = [
      debt({ id: "large", outstandingBalanceSatang: 50_000_00, interestRateAnnual: 30 }),
      debt({ id: "small-low-rate", outstandingBalanceSatang: 5_000_00, interestRateAnnual: 8 }),
      debt({ id: "small-high-late", outstandingBalanceSatang: 5_000_00, interestRateAnnual: 18, dueDate: "2026-07-25" }),
      debt({ id: "small-high-early", outstandingBalanceSatang: 5_000_00, interestRateAnnual: 18, dueDate: "2026-07-10" }),
    ];

    expect(orderBySnowball(input).map((item) => item.id)).toEqual([
      "small-high-early",
      "small-high-late",
      "small-low-rate",
      "large",
    ]);
    expect(input.map((item) => item.id)).toEqual(["large", "small-low-rate", "small-high-late", "small-high-early"]);
  });

  it("orders avalanche by highest interest, then smaller balance, due date, and id", () => {
    const input = [
      debt({ id: "zero-rate", outstandingBalanceSatang: 1_000_00, interestRateAnnual: 0 }),
      debt({ id: "unknown-rate", outstandingBalanceSatang: 500_00, interestRateAnnual: undefined }),
      debt({ id: "high-large", outstandingBalanceSatang: 50_000_00, interestRateAnnual: 24 }),
      debt({ id: "high-small", outstandingBalanceSatang: 5_000_00, interestRateAnnual: 24 }),
      debt({ id: "mid", outstandingBalanceSatang: 3_000_00, interestRateAnnual: 12 }),
    ];

    expect(orderByAvalanche(input).map((item) => item.id)).toEqual([
      "high-small",
      "high-large",
      "mid",
      "unknown-rate",
      "zero-rate",
    ]);
    expect(input.map((item) => item.id)).toEqual(["zero-rate", "unknown-rate", "high-large", "high-small", "mid"]);
  });

  it("builds comparison with focus receiving minimum plus extra and non-focus receiving minimum only", () => {
    const small = debt({ id: "small", outstandingBalanceSatang: 5_000_00, minimumPaymentSatang: 500_00, interestRateAnnual: 12 });
    const highRate = debt({ id: "high-rate", outstandingBalanceSatang: 20_000_00, minimumPaymentSatang: 1_000_00, interestRateAnnual: 30 });
    const lowRate = debt({ id: "low-rate", outstandingBalanceSatang: 30_000_00, minimumPaymentSatang: 1_500_00, interestRateAnnual: 6 });

    const comparison = buildDebtPortfolioComparison([lowRate, highRate, small], 300_00);

    expect(comparison.activeDebtCount).toBe(3);
    expect(comparison.snowball.focusDebtId).toBe("small");
    expect(comparison.avalanche.focusDebtId).toBe("high-rate");
    expect(comparison.snowball.orderedDebtIds).toEqual(["small", "high-rate", "low-rate"]);
    expect(comparison.avalanche.orderedDebtIds).toEqual(["high-rate", "small", "low-rate"]);
    expect(comparison.snowball.simulations.find((item) => item.debtId === "small")?.monthlyPaymentSatang).toBe(800_00);
    expect(comparison.snowball.simulations.find((item) => item.debtId === "high-rate")?.monthlyPaymentSatang).toBe(1_000_00);
    expect(comparison.snowball.totalEstimatedRemainingInterestSatang).toBe(
      comparison.snowball.simulations.reduce((sum, item) => sum + item.estimatedRemainingInterestSatang, 0),
    );
  });

  it("supports zero extra budget, empty debts, and one active debt", () => {
    const empty = buildDebtPortfolioComparison([], 0);
    expect(empty.activeDebtCount).toBe(0);
    expect(empty.snowball.focusDebtId).toBeNull();

    const single = buildDebtPortfolioComparison([debt({ id: "only" })], 0);
    expect(single.activeDebtCount).toBe(1);
    expect(single.snowball.focusDebtId).toBe("only");
    expect(single.avalanche.focusDebtId).toBe("only");
  });

  it("rejects invalid extra payment budgets instead of repairing them", () => {
    expect(() => buildDebtPortfolioComparison([debt()], -1)).toThrow("จำนวนเงินต้องไม่ติดลบ");
    expect(() => buildDebtPortfolioComparison([debt()], Number.NaN)).toThrow("รูปแบบจำนวนเงินไม่ถูกต้อง");
    expect(() => buildDebtPortfolioComparison([debt()], 100.5)).toThrow("extraPaymentBudgetSatang must be an integer");
  });

  it("does not mutate financial fields on debt inputs", () => {
    const source = debt({ id: "immutable", outstandingBalanceSatang: 8_000_00, minimumPaymentSatang: 500_00 });
    const before = structuredClone(source);

    buildDebtPortfolioComparison([source], 1_000_00);

    expect(source).toEqual(before);
  });
});
