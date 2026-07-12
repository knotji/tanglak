export type ExtraPaymentBehavior = "reduce_principal" | "advance_installment" | "unknown";

export type InterestRatePeriod = "monthly" | "annual";

export type AffordabilityStatus = "safe" | "tight" | "risky" | "insufficient_data";

export interface DebtSimulationInput {
  balanceSatang: number;
  interestRatePercent: number; // e.g., 15 for 15% annual or 1.25 for 1.25% monthly
  interestRatePeriod: InterestRatePeriod;
  minimumPaymentSatang: number;
  paymentAmountSatang: number;
  dueDate?: string; // YYYY-MM-DD
  installmentAmountSatang?: number;
  remainingInstallments?: number;
  nextPrincipalSatang?: number;
  nextInterestSatang?: number;
  extraPaymentBehavior: ExtraPaymentBehavior;
  earlyPayoffFeeSatang?: number;
  plannedIncomeSatang?: number;
  currentMonthSpendingSatang?: number;
  debtPaymentsThisMonthSatang?: number;
  minimumCashReserveSatang?: number;
  safeBufferSatang?: number;
}

export interface DebtSimulationOutput {
  paymentAmountSatang: number;
  interestPaidThisPaymentSatang: number;
  principalPaidThisPaymentSatang: number;
  balanceAfterPaymentSatang: number;
  nextPeriodInterestSatang: number;
  estimatedInstallmentsRemaining: number | null;
  estimatedPayoffDate: string | null; // e.g., "สิงหาคม 2569" or "August 2026"
  estimatedRemainingInterestSatang: number;
  interestSavedVsMinimumSatang: number;
  cashRemainingAfterPaymentSatang: number | null;
  affordabilityStatus: AffordabilityStatus;
  warnings: string[];
  assumptions: string[];
  precisionLevel: "full" | "limited" | "none";
}
