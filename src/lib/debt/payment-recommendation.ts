import { simulateDebtPayment, getMonthlyRatePercent } from "./payment-simulator";
import type { DebtSimulationInput, DebtSimulationOutput } from "./payment-types";

export interface PlanOptions {
  minimum: DebtSimulationOutput;
  recommended: DebtSimulationOutput;
  accelerated: DebtSimulationOutput;
  recommendedAmountSatang: number;
  acceleratedAmountSatang: number;
}

/**
 * Generates simulation outputs for the three plan options: Minimum, Recommended, and Accelerated.
 */
export function generatePlanOptions(
  input: Omit<DebtSimulationInput, "paymentAmountSatang">
): PlanOptions {
  const {
    balanceSatang,
    interestRatePercent,
    interestRatePeriod,
    minimumPaymentSatang,
    nextInterestSatang,
    earlyPayoffFeeSatang = 0,
    plannedIncomeSatang,
    currentMonthSpendingSatang,
    debtPaymentsThisMonthSatang,
    minimumCashReserveSatang = 0,
    safeBufferSatang = 0,
  } = input;

  const monthlyRatePercent = getMonthlyRatePercent(interestRatePercent, interestRatePeriod);
  
  // Calculate first month's interest to establish payoff amount
  let firstMonthInterest = 0;
  if (nextInterestSatang !== undefined && nextInterestSatang >= 0) {
    firstMonthInterest = nextInterestSatang;
  } else {
    firstMonthInterest = Math.round(balanceSatang * (monthlyRatePercent / 100));
  }
  firstMonthInterest = Math.max(0, firstMonthInterest);

  const payoffAmountSatang = balanceSatang + firstMonthInterest + earlyPayoffFeeSatang;

  let recAmountSatang = minimumPaymentSatang;
  let accAmountSatang = minimumPaymentSatang;

  const hasContext =
    plannedIncomeSatang !== undefined &&
    currentMonthSpendingSatang !== undefined &&
    debtPaymentsThisMonthSatang !== undefined;

  if (hasContext) {
    // Recommended plan amount = plannedIncome - spending - already paid - reserve - buffer
    const affordableRec =
      plannedIncomeSatang -
      currentMonthSpendingSatang -
      debtPaymentsThisMonthSatang -
      minimumCashReserveSatang -
      safeBufferSatang;

    recAmountSatang = Math.max(minimumPaymentSatang, affordableRec);
    recAmountSatang = Math.min(payoffAmountSatang, recAmountSatang);

    // Accelerated plan amount = plannedIncome - spending - already paid - reserve
    const affordableAcc =
      plannedIncomeSatang -
      currentMonthSpendingSatang -
      debtPaymentsThisMonthSatang -
      minimumCashReserveSatang;

    accAmountSatang = Math.max(minimumPaymentSatang, affordableAcc);
    accAmountSatang = Math.min(payoffAmountSatang, accAmountSatang);

    // Safety: Accelerated should be at least Recommended
    accAmountSatang = Math.max(accAmountSatang, recAmountSatang);
  } else {
    // Financial context is incomplete:
    // We cannot offer a personalized recommendation.
    // We set recommended to minimum, and accelerated to a sensible default extra (e.g. minimum + ฿1,000, capped at payoff)
    recAmountSatang = minimumPaymentSatang;
    accAmountSatang = Math.min(payoffAmountSatang, minimumPaymentSatang + 100000); // +฿1,000
    accAmountSatang = Math.max(accAmountSatang, recAmountSatang);
  }

  // Simulate all three plans
  const minimum = simulateDebtPayment({
    ...input,
    paymentAmountSatang: minimumPaymentSatang,
  });

  const recommended = simulateDebtPayment({
    ...input,
    paymentAmountSatang: recAmountSatang,
  });

  const accelerated = simulateDebtPayment({
    ...input,
    paymentAmountSatang: accAmountSatang,
  });

  return {
    minimum,
    recommended,
    accelerated,
    recommendedAmountSatang: recAmountSatang,
    acceleratedAmountSatang: accAmountSatang,
  };
}
