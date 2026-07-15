import { describe, expect, it } from "vitest";
import {
  AVALANCHE_MIN_INTEREST_SAVING_SATANG,
  recommendFocusDebt,
} from "@/lib/finance/portfolio-recommendation";
import type { DebtPortfolioComparison } from "@/lib/debt/portfolio-strategy";

function comparison(overrides: Partial<DebtPortfolioComparison> = {}): DebtPortfolioComparison {
  return {
    activeDebtCount: 2,
    interestDifferenceSatang: 0,
    snowball: {
      strategy: "snowball",
      orderedDebtIds: ["small", "high"],
      focusDebtId: "small",
      totalEstimatedRemainingInterestSatang: 10_000_00,
      simulations: [],
    },
    avalanche: {
      strategy: "avalanche",
      orderedDebtIds: ["high", "small"],
      focusDebtId: "high",
      totalEstimatedRemainingInterestSatang: 9_900_00,
      simulations: [],
    },
    ...overrides,
  };
}

describe("recommendFocusDebt", () => {
  it("recommends avalanche when estimated interest saving is above threshold", () => {
    const result = recommendFocusDebt(comparison({ interestDifferenceSatang: AVALANCHE_MIN_INTEREST_SAVING_SATANG + 1 }));

    expect(result?.recommendedStrategy).toBe("avalanche");
    expect(result?.focusDebtId).toBe("high");
    expect(result?.reason).toContain("ลดดอกเบี้ยก่อน");
    expect(result?.reason).toContain("ประมาณ");
  });

  it("recommends snowball when saving is below threshold", () => {
    const result = recommendFocusDebt(comparison({ interestDifferenceSatang: AVALANCHE_MIN_INTEREST_SAVING_SATANG - 1 }));

    expect(result?.recommendedStrategy).toBe("snowball");
    expect(result?.focusDebtId).toBe("small");
    expect(result?.reason).toContain("ปิดก้อนเล็กก่อน");
    expect(result?.reason).toContain("ชัยชนะเร็วขึ้น");
  });

  it("uses snowball at the exact threshold boundary", () => {
    const result = recommendFocusDebt(comparison({ interestDifferenceSatang: AVALANCHE_MIN_INTEREST_SAVING_SATANG }));

    expect(result?.recommendedStrategy).toBe("snowball");
  });

  it("does not surface a recommendation when there are fewer than two active debts", () => {
    expect(recommendFocusDebt(comparison({ activeDebtCount: 1 }))).toBeNull();
    expect(recommendFocusDebt(comparison({ activeDebtCount: 0 }))).toBeNull();
  });

  it("does not mutate the comparison input", () => {
    const input = comparison({ interestDifferenceSatang: 1_000_00 });
    const before = structuredClone(input);

    recommendFocusDebt(input);

    expect(input).toEqual(before);
  });
});
