import { formatTHB } from "@/lib/finance/money";
import type { DebtPortfolioComparison, DebtStrategy } from "@/lib/debt/portfolio-strategy";

export const AVALANCHE_MIN_INTEREST_SAVING_SATANG = 500_00;

export type PortfolioRecommendation = {
  recommendedStrategy: DebtStrategy;
  focusDebtId: string | null;
  estimatedInterestSavingSatang: number;
  reason: string;
};

function strategyLabel(strategy: DebtStrategy): string {
  return strategy === "avalanche" ? "ลดดอกเบี้ยก่อน" : "ปิดก้อนเล็กก่อน";
}

export function portfolioStrategyLabel(strategy: DebtStrategy): string {
  return strategyLabel(strategy);
}

export function recommendFocusDebt(comparison: DebtPortfolioComparison): PortfolioRecommendation | null {
  if (comparison.activeDebtCount < 2) return null;

  const avalancheSavingSatang = Math.max(0, comparison.interestDifferenceSatang);
  if (avalancheSavingSatang > AVALANCHE_MIN_INTEREST_SAVING_SATANG) {
    return {
      recommendedStrategy: "avalanche",
      focusDebtId: comparison.avalanche.focusDebtId,
      estimatedInterestSavingSatang: avalancheSavingSatang,
      reason: `แนะนำ${strategyLabel("avalanche")} เพราะคาดว่าจะลดดอกเบี้ยรวมได้ประมาณ ${formatTHB(avalancheSavingSatang)} เมื่อเทียบกับการปิดก้อนเล็กก่อน`,
    };
  }

  return {
    recommendedStrategy: "snowball",
    focusDebtId: comparison.snowball.focusDebtId,
    estimatedInterestSavingSatang: avalancheSavingSatang,
    reason:
      avalancheSavingSatang > 0
        ? `ส่วนต่างดอกเบี้ยประมาณ ${formatTHB(avalancheSavingSatang)} ยังไม่สูงพอ จึงแนะนำ${strategyLabel("snowball")}เพื่อให้เห็นชัยชนะเร็วขึ้น`
        : `ดอกเบี้ยรวมที่คาดไว้ใกล้เคียงกัน จึงแนะนำ${strategyLabel("snowball")}เพื่อให้เห็นชัยชนะเร็วขึ้น`,
  };
}
