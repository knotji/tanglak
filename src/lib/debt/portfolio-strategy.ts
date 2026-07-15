import type { Debt } from "@/types/domain";
import { assertMoneySatang } from "@/lib/finance/money-guards";
import { simulateDebtPayment } from "./payment-simulator";
import type { DebtSimulationOutput } from "./payment-types";

export type DebtStrategy = "snowball" | "avalanche";

export type PortfolioSimulationContext = {
  plannedIncomeSatang?: number;
  currentMonthSpendingSatang?: number;
  debtPaymentsThisMonthSatang?: number;
  minimumCashReserveSatang?: number;
  safeBufferSatang?: number;
};

export type DebtStrategySimulationDetail = {
  debtId: string;
  monthlyPaymentSatang: number;
  estimatedRemainingInterestSatang: number;
  estimatedInstallmentsRemaining: number | null;
  estimatedPayoffDate: string | null;
  warnings: string[];
  assumptions: string[];
  output: DebtSimulationOutput;
};

export type DebtStrategyResult = {
  strategy: DebtStrategy;
  orderedDebtIds: string[];
  focusDebtId: string | null;
  totalEstimatedRemainingInterestSatang: number;
  simulations: DebtStrategySimulationDetail[];
};

export type DebtPortfolioComparison = {
  snowball: DebtStrategyResult;
  avalanche: DebtStrategyResult;
  interestDifferenceSatang: number;
  activeDebtCount: number;
};

export function filterActiveDebts(debts: readonly Debt[]): Debt[] {
  return debts.filter((debt) => debt.status === "active");
}

function balanceOf(debt: Debt): number {
  return debt.outstandingBalanceSatang ?? debt.originalAmountSatang ?? 0;
}

function minimumOf(debt: Debt): number {
  return debt.minimumPaymentSatang ?? debt.amountDueSatang ?? 0;
}

function interestRateOf(debt: Debt): number {
  return debt.interestRateAnnual ?? 0;
}

function compareDueDateThenId(a: Debt, b: Debt): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  }
  return a.id.localeCompare(b.id);
}

export function orderBySnowball(debts: readonly Debt[]): Debt[] {
  return [...filterActiveDebts(debts)].sort((a, b) => {
    const balanceDiff = balanceOf(a) - balanceOf(b);
    if (balanceDiff !== 0) return balanceDiff;

    const interestDiff = interestRateOf(b) - interestRateOf(a);
    if (interestDiff !== 0) return interestDiff;

    return compareDueDateThenId(a, b);
  });
}

export function orderByAvalanche(debts: readonly Debt[]): Debt[] {
  return [...filterActiveDebts(debts)].sort((a, b) => {
    const interestDiff = interestRateOf(b) - interestRateOf(a);
    if (interestDiff !== 0) return interestDiff;

    const balanceDiff = balanceOf(a) - balanceOf(b);
    if (balanceDiff !== 0) return balanceDiff;

    return compareDueDateThenId(a, b);
  });
}

function assertValidExtraPaymentBudget(extraPaymentBudgetSatang: number): void {
  assertMoneySatang(extraPaymentBudgetSatang, "nonnegative", "extraPaymentBudgetSatang");
  if (!Number.isInteger(extraPaymentBudgetSatang)) {
    throw new Error("extraPaymentBudgetSatang must be an integer");
  }
}

function buildStrategyResult(
  strategy: DebtStrategy,
  orderedDebts: readonly Debt[],
  extraPaymentBudgetSatang: number,
  context: PortfolioSimulationContext,
): DebtStrategyResult {
  const focusDebtId = orderedDebts[0]?.id ?? null;
  const simulations = orderedDebts.map((debt): DebtStrategySimulationDetail => {
    const isFocusDebt = debt.id === focusDebtId;
    const minimumPaymentSatang = minimumOf(debt);
    const monthlyPaymentSatang = minimumPaymentSatang + (isFocusDebt ? extraPaymentBudgetSatang : 0);
    const output = simulateDebtPayment({
      balanceSatang: balanceOf(debt),
      interestRatePercent: interestRateOf(debt),
      interestRatePeriod: "annual",
      minimumPaymentSatang,
      paymentAmountSatang: monthlyPaymentSatang,
      dueDate: debt.dueDate,
      extraPaymentBehavior: "reduce_principal",
      plannedIncomeSatang: context.plannedIncomeSatang,
      currentMonthSpendingSatang: context.currentMonthSpendingSatang,
      debtPaymentsThisMonthSatang: context.debtPaymentsThisMonthSatang,
      minimumCashReserveSatang: context.minimumCashReserveSatang,
      safeBufferSatang: context.safeBufferSatang,
    });

    return {
      debtId: debt.id,
      monthlyPaymentSatang: output.paymentAmountSatang,
      estimatedRemainingInterestSatang: output.estimatedRemainingInterestSatang ?? 0,
      estimatedInstallmentsRemaining: output.estimatedInstallmentsRemaining,
      estimatedPayoffDate: output.estimatedPayoffDate,
      warnings: output.warnings,
      assumptions: output.assumptions,
      output,
    };
  });

  return {
    strategy,
    orderedDebtIds: orderedDebts.map((debt) => debt.id),
    focusDebtId,
    totalEstimatedRemainingInterestSatang: simulations.reduce(
      (sum, simulation) => sum + simulation.estimatedRemainingInterestSatang,
      0,
    ),
    simulations,
  };
}

export function buildDebtPortfolioComparison(
  debts: readonly Debt[],
  extraPaymentBudgetSatang: number,
  context: PortfolioSimulationContext = {},
): DebtPortfolioComparison {
  assertValidExtraPaymentBudget(extraPaymentBudgetSatang);

  const activeDebts = filterActiveDebts(debts);
  const snowball = buildStrategyResult("snowball", orderBySnowball(activeDebts), extraPaymentBudgetSatang, context);
  const avalanche = buildStrategyResult("avalanche", orderByAvalanche(activeDebts), extraPaymentBudgetSatang, context);

  return {
    snowball,
    avalanche,
    interestDifferenceSatang:
      snowball.totalEstimatedRemainingInterestSatang - avalanche.totalEstimatedRemainingInterestSatang,
    activeDebtCount: activeDebts.length,
  };
}
