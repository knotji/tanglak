import { describe, expect, it } from "vitest";
import {
  approximateMonthlyRatePercent,
  formatAnnualInterestLabel,
  formatApproximateMonthlyRateLabel,
  formatInterestRateSummary,
  INTEREST_APPROXIMATION_DISCLAIMER_TH,
} from "@/lib/finance/debt-interest";

describe("interest rate display -- approximation, never exact", () => {
  it("formats the annual rate label", () => {
    expect(formatAnnualInterestLabel(16.5)).toBe("ดอกเบี้ย 16.5% ต่อปี");
  });

  it("derives the monthly rate as a simple annual/12 approximation", () => {
    expect(approximateMonthlyRatePercent(12)).toBe(1);
    expect(approximateMonthlyRatePercent(16.5)).toBeCloseTo(1.375, 5);
  });

  it("labels the monthly rate explicitly as an approximation", () => {
    expect(formatApproximateMonthlyRateLabel(12)).toBe("ประมาณ 1% ต่อเดือน");
    expect(formatApproximateMonthlyRateLabel(16.5)).toContain("ประมาณ");
    expect(formatApproximateMonthlyRateLabel(16.5)).toContain("ต่อเดือน");
  });

  it("combines annual and approximate monthly into one summary label", () => {
    const summary = formatInterestRateSummary(16.5);
    expect(summary).toContain("ดอกเบี้ย 16.5% ต่อปี");
    expect(summary).toContain("ประมาณ");
    expect(summary).toContain("ต่อเดือน");
  });

  it("exposes a disclaimer that the estimate may differ from the real charge", () => {
    expect(INTEREST_APPROXIMATION_DISCLAIMER_TH).toContain("ประมาณ");
    expect(INTEREST_APPROXIMATION_DISCLAIMER_TH).toContain("สถาบันการเงิน");
  });

  it("never rounds to a misleadingly precise trailing-zero figure for whole numbers", () => {
    // 12 / 12 = 1, not "1.00" -- avoids implying false precision.
    expect(formatAnnualInterestLabel(12)).toBe("ดอกเบี้ย 12% ต่อปี");
  });
});
