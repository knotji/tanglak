/**
 * Interest-rate display copy. Every figure here is explicitly labeled as an
 * approximation for planning purposes only -- never presented as an exact
 * charge, and never used as an input to any payoff/amortization
 * calculation (none exists in this codebase). See
 * docs/DEBT_PLANNING_ENGINE.md for the full rationale.
 */
export const INTEREST_APPROXIMATION_DISCLAIMER_TH =
  "ดอกเบี้ยโดยประมาณ อาจต่างจากยอดที่สถาบันการเงินเรียกเก็บจริง";

function formatRateNumber(rate: number): string {
  // Trim to at most 2 decimal places without trailing zeros (16.5, not
  // 16.50; 16, not 16.00) -- these are user-entered percentages, not
  // satang-integer money, so no financial-precision rule applies here.
  return Number(rate.toFixed(2)).toString();
}

/** "ดอกเบี้ย 16.5% ต่อปี" */
export function formatAnnualInterestLabel(annualRatePercent: number): string {
  return `ดอกเบี้ย ${formatRateNumber(annualRatePercent)}% ต่อปี`;
}

/**
 * Derives a display-only approximate monthly rate as annualRate / 12. This
 * is a simple average, not a compounding model -- it must never be used
 * for payoff or amortization math, only shown as a rough planning
 * reference alongside the annual rate.
 */
export function approximateMonthlyRatePercent(annualRatePercent: number): number {
  return annualRatePercent / 12;
}

/** "ประมาณ 1.38% ต่อเดือน" */
export function formatApproximateMonthlyRateLabel(annualRatePercent: number): string {
  return `ประมาณ ${formatRateNumber(approximateMonthlyRatePercent(annualRatePercent))}% ต่อเดือน`;
}

/** "ดอกเบี้ย 16.5% ต่อปี (ประมาณ 1.38% ต่อเดือน)" */
export function formatInterestRateSummary(annualRatePercent: number): string {
  return `${formatAnnualInterestLabel(annualRatePercent)} (${formatApproximateMonthlyRateLabel(annualRatePercent)})`;
}
