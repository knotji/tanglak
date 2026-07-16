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
  daysEarlyOrLate: number | null;
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
  if (!isValidMonthQuery(month) || !isValidDateKey(todayKey) || !todayKey.startsWith(`${month}-`)) {
    return emptyForecast(budgetSummary);
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
  const averageDailySpendSatang = Math.max(0, Math.floor(trailingSpendSatang / trailingWindowDaysUsed));
  const remainingDaysInMonth = Math.max(0, daysBetween(todayKey, endDate));
  const projectedAdditionalSpendSatang = averageDailySpendSatang * remainingDaysInMonth;
  const projectedMonthEndSpendSatang = budgetSummary.spentTotalSatang + projectedAdditionalSpendSatang;
  const remainingBudgetSatang = budgetSummary.remainingTotalSatang;
  const projectedBudgetVarianceSatang = budgetSummary.plannedTotalSatang - projectedMonthEndSpendSatang;
  const onTrackToExceedBudget =
    budgetSummary.hasBudget &&
    budgetSummary.plannedTotalSatang > 0 &&
    remainingBudgetSatang > 0 &&
    averageDailySpendSatang > 0 &&
    projectedBudgetVarianceSatang < 0;

  const projectedBudgetExhaustionDate = averageDailySpendSatang > 0 && remainingBudgetSatang > 0
    ? addDays(todayKey, Math.ceil(remainingBudgetSatang / averageDailySpendSatang))
    : null;
  const daysEarlyOrLate = projectedBudgetExhaustionDate
    ? daysBetween(projectedBudgetExhaustionDate, endDate)
    : null;

  return {
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
    daysEarlyOrLate,
  };
}

function emptyForecast(budgetSummary: BudgetSummary): SpendForecast {
  return {
    trailingWindowDaysUsed: 0,
    trailingSpendSatang: 0,
    averageDailySpendSatang: 0,
    remainingDaysInMonth: 0,
    projectedAdditionalSpendSatang: 0,
    projectedMonthEndSpendSatang: budgetSummary.spentTotalSatang,
    remainingBudgetSatang: budgetSummary.remainingTotalSatang,
    projectedBudgetVarianceSatang: budgetSummary.plannedTotalSatang - budgetSummary.spentTotalSatang,
    onTrackToExceedBudget: false,
    projectedBudgetExhaustionDate: null,
    daysEarlyOrLate: null,
  };
}
