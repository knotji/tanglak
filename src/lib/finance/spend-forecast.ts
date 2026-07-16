import {
  isBudgetRelevant,
  transactionSpendDelta,
  type BudgetSummary,
} from "@/lib/finance/budget-calculations";
import {
  getBangkokDateOf,
  getBangkokMonthRange,
  isValidDateKey,
  isValidMonthQuery,
  shiftDateKey,
} from "@/lib/finance/date";
import type { Transaction } from "@/types/domain";

export type SpendForecast = {
  isAvailable: boolean;
  unavailableReason?: "no_budget" | "budget_exhausted" | "invalid_period";
  trailingWindowDaysUsed: number;
  trailingSpendSatang: number;
  averageDailySpendSatang: number;
  remainingDaysInMonth: number;
  projectedAdditionalSpendSatang: number;
  projectedMonthEndSpendSatang: number;
  remainingBudgetSatang: number;
  projectedBudgetVarianceSatang: number;
  onTrackToExceedBudget: boolean;
  projectedBudgetExhaustionDate: string | null;
  daysBeforeMonthEnd: number | null;
};

const DEFAULT_TRAILING_WINDOW_DAYS = 7;

function daysBetweenInclusive(startDate: string, endDate: string): number {
  if (!isValidDateKey(startDate) || !isValidDateKey(endDate) || startDate > endDate) {
    throw new Error("Invalid date range");
  }

  let days = 1;
  let cursor = startDate;
  while (cursor < endDate) {
    cursor = shiftDateKey(cursor, 1);
    days += 1;
  }
  return days;
}

function addDays(dateKey: string, days: number): string {
  return shiftDateKey(dateKey, days);
}

function daysBetween(startDate: string, endDate: string): number {
  if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
    throw new Error("Invalid date");
  }
  if (startDate === endDate) return 0;

  const sign = startDate < endDate ? 1 : -1;
  let days = 0;
  let cursor = startDate;
  while (cursor !== endDate) {
    cursor = shiftDateKey(cursor, sign);
    days += sign;
  }
  return days;
}

export function buildSpendForecast(
  transactions: Transaction[],
  budgetSummary: BudgetSummary,
  month: string,
  todayKey: string,
  trailingWindowDays = DEFAULT_TRAILING_WINDOW_DAYS,
): SpendForecast {
  // 1. Invalid Period Check
  if (!isValidMonthQuery(month) || !isValidDateKey(todayKey) || !todayKey.startsWith(`${month}-`)) {
    return emptyForecast(budgetSummary, "invalid_period");
  }

  // 2. No Budget Check
  if (!budgetSummary.hasBudget || budgetSummary.plannedTotalSatang === 0) {
    return emptyForecast(budgetSummary, "no_budget");
  }

  // 3. Budget Exhausted Check
  if (budgetSummary.remainingTotalSatang <= 0) {
    return emptyForecast(budgetSummary, "budget_exhausted");
  }

  const { startDate, endDate } = getBangkokMonthRange(month);
  const normalizedWindowDays = Math.max(1, Math.floor(trailingWindowDays));
  let windowStart = todayKey;
  for (let i = 1; i < normalizedWindowDays; i += 1) {
    const previous = shiftDateKey(windowStart, -1);
    if (previous < startDate) break;
    windowStart = previous;
  }

  const trailingWindowDaysUsed = daysBetweenInclusive(windowStart, todayKey);
  const trailingSpendSatang = transactions.reduce((sum, transaction) => {
    if (!isBudgetRelevant(transaction, month)) return sum;
    const transactionDate = getBangkokDateOf(transaction.occurredAt);
    if (transactionDate < windowStart || transactionDate > todayKey) return sum;
    return sum + transactionSpendDelta(transaction);
  }, 0);

  // Deterministically round down daily average satang to integer
  const averageDailySpendSatang = Math.max(0, Math.floor(trailingSpendSatang / trailingWindowDaysUsed));
  const remainingDaysInMonth = Math.max(0, daysBetween(todayKey, endDate));
  const projectedAdditionalSpendSatang = averageDailySpendSatang * remainingDaysInMonth;
  const projectedMonthEndSpendSatang = budgetSummary.spentTotalSatang + projectedAdditionalSpendSatang;
  const remainingBudgetSatang = budgetSummary.remainingTotalSatang;

  // projectedBudgetVarianceSatang > 0 = คาดว่าเกินงบ, < 0 = คาดว่าเหลืองบ
  const projectedBudgetVarianceSatang = projectedMonthEndSpendSatang - budgetSummary.plannedTotalSatang;

  // onTrackToExceedBudget is true ONLY when projected spend is strictly above total budget
  const onTrackToExceedBudget = projectedMonthEndSpendSatang > budgetSummary.plannedTotalSatang;

  let projectedBudgetExhaustionDate: string | null = null;
  let daysBeforeMonthEnd: number | null = null;

  if (averageDailySpendSatang > 0 && remainingBudgetSatang > 0 && onTrackToExceedBudget) {
    const daysUntilExhaustion = Math.ceil(remainingBudgetSatang / averageDailySpendSatang);
    projectedBudgetExhaustionDate = addDays(todayKey, daysUntilExhaustion);

    // 0 = พอดีสิ้นเดือน, positive = คาดว่าหมดก่อนสิ้นเดือนกี่วัน
    const diff = daysBetween(projectedBudgetExhaustionDate, endDate);
    if (diff >= 0) {
      daysBeforeMonthEnd = diff;
    }
  }

  return {
    isAvailable: true,
    trailingWindowDaysUsed,
    trailingSpendSatang,
    averageDailySpendSatang,
    remainingDaysInMonth,
    projectedAdditionalSpendSatang,
    projectedMonthEndSpendSatang,
    remainingBudgetSatang,
    projectedBudgetVarianceSatang,
    onTrackToExceedBudget,
    projectedBudgetExhaustionDate,
    daysBeforeMonthEnd,
  };
}

function emptyForecast(
  budgetSummary: BudgetSummary,
  reason: "no_budget" | "budget_exhausted" | "invalid_period",
): SpendForecast {
  const projectedBudgetVarianceSatang = budgetSummary.spentTotalSatang - budgetSummary.plannedTotalSatang;
  return {
    isAvailable: false,
    unavailableReason: reason,
    trailingWindowDaysUsed: 0,
    trailingSpendSatang: 0,
    averageDailySpendSatang: 0,
    remainingDaysInMonth: 0,
    projectedAdditionalSpendSatang: 0,
    projectedMonthEndSpendSatang: budgetSummary.spentTotalSatang,
    remainingBudgetSatang: budgetSummary.remainingTotalSatang,
    projectedBudgetVarianceSatang,
    onTrackToExceedBudget: false,
    projectedBudgetExhaustionDate: null,
    daysBeforeMonthEnd: null,
  };
}
