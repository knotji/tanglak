import { simulateDebtPayment, getMonthlyRatePercent } from "./payment-simulator";
import type { DebtSimulationInput, DebtSimulationOutput } from "./payment-types";

export interface PlanOptions {
  minimum: DebtSimulationOutput;
  recommended: DebtSimulationOutput;
  accelerated: DebtSimulationOutput;
  recommendedAmountSatang: number | null;
  acceleratedAmountSatang: number | null;
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

  let recAmountSatang: number | null = null;
  let accAmountSatang: number | null = null;

  const hasContext =
    plannedIncomeSatang !== undefined &&
    currentMonthSpendingSatang !== undefined &&
    debtPaymentsThisMonthSatang !== undefined;

  if (hasContext) {
    const availableCashFlow = plannedIncomeSatang - currentMonthSpendingSatang - debtPaymentsThisMonthSatang;

    // Recommended plan: cash left after reserve & buffer
    const affordableRec = availableCashFlow - minimumCashReserveSatang - safeBufferSatang;
    if (affordableRec >= minimumPaymentSatang) {
      recAmountSatang = Math.min(payoffAmountSatang, affordableRec);
    } else {
      recAmountSatang = null;
    }

    // Accelerated plan: cash left after reserve
    const affordableAcc = availableCashFlow - minimumCashReserveSatang;
    if (affordableAcc >= minimumPaymentSatang) {
      accAmountSatang = Math.min(payoffAmountSatang, affordableAcc);
      if (recAmountSatang !== null) {
        accAmountSatang = Math.max(accAmountSatang, recAmountSatang);
      }
    } else {
      accAmountSatang = null;
    }
  } else {
    // Financial context is incomplete: no personalized recommendation
    recAmountSatang = null;
    accAmountSatang = null;
  }

  // Simulate all three plans
  const minimum = simulateDebtPayment({
    ...input,
    paymentAmountSatang: minimumPaymentSatang,
  });

  const recommended = simulateDebtPayment({
    ...input,
    paymentAmountSatang: recAmountSatang !== null ? recAmountSatang : minimumPaymentSatang,
  });

  const accelerated = simulateDebtPayment({
    ...input,
    paymentAmountSatang: accAmountSatang !== null ? accAmountSatang : minimumPaymentSatang,
  });

  return {
    minimum,
    recommended,
    accelerated,
    recommendedAmountSatang: recAmountSatang,
    acceleratedAmountSatang: accAmountSatang,
  };
}
