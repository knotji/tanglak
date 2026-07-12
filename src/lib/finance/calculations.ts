import type { Account, Debt, Transaction } from "@/types/domain";
import { getBangkokTodayString, getBangkokMonthOf } from "@/lib/finance/date";

export type MonthlyTotals = {
  incomeSatang: number;
  livingExpenseSatang: number;
  debtPaymentSatang: number;
  transferSatang: number;
  refundSatang: number;
  cashRemainingSatang: number;
  unreviewedCount: number;
};

export function confirmed(transactions: Transaction[]): Transaction[] {
  return transactions.filter((transaction) => transaction.status === "confirmed");
}

export function calculateMonthlyTotals(
  transactions: Transaction[],
  month: string,
): MonthlyTotals {
  const initial: MonthlyTotals = {
    incomeSatang: 0,
    livingExpenseSatang: 0,
    debtPaymentSatang: 0,
    transferSatang: 0,
    refundSatang: 0,
    cashRemainingSatang: 0,
    unreviewedCount: 0,
  };

  const totals = transactions
    // Bangkok-local month comparison, not a naive string prefix -- see
    // getBangkokMonthOf for why a prefix check silently mis-buckets
    // transactions near the Bangkok midnight boundary when occurredAt is
    // returned in UTC (as Supabase does).
    .filter((transaction) => getBangkokMonthOf(transaction.occurredAt) === month)
    .reduce((acc, transaction) => {
      if (transaction.status !== "confirmed") {
        acc.unreviewedCount += 1;
        return acc;
      }

      if (transaction.type === "income") acc.incomeSatang += transaction.amountSatang;
      if (transaction.type === "expense") acc.livingExpenseSatang += transaction.amountSatang;
      if (transaction.type === "debt_payment") acc.debtPaymentSatang += transaction.amountSatang;
      if (transaction.type === "transfer") acc.transferSatang += transaction.amountSatang;
      if (transaction.type === "refund") acc.refundSatang += transaction.amountSatang;

      return acc;
    }, initial);

  totals.cashRemainingSatang =
    totals.incomeSatang +
    totals.refundSatang -
    totals.livingExpenseSatang -
    totals.debtPaymentSatang;

  return totals;
}

/**
 * Cash remaining this month, computed from the canonical saved monthly
 * income (`MonthlyBudget.incomeSatang`, via `BudgetSummary.expectedIncomeSatang`)
 * rather than actual recorded income-type transactions. This is the shared
 * selector every page must use for "remaining money" so it agrees with the
 * saved income shown on the Budget page -- see docs/MONTHLY_BUDGET_ENGINE.md.
 * `totals.incomeSatang` (actual income transactions) is intentionally not
 * used here; it is a different concept from the user's planned income.
 */
export function calculateCashRemaining(
  plannedIncomeSatang: number,
  totals: Pick<MonthlyTotals, "livingExpenseSatang" | "debtPaymentSatang" | "refundSatang">,
): number {
  return plannedIncomeSatang + totals.refundSatang - totals.livingExpenseSatang - totals.debtPaymentSatang;
}

export function remainingToMinimum(debt: Debt): number {
  return Math.max(
    0,
    (debt.minimumPaymentSatang ?? 0) - debt.amountPaidThisCycleSatang,
  );
}

export function remainingToFullAmount(debt: Debt): number {
  return Math.max(
    0,
    (debt.amountDueSatang ?? debt.statementBalanceSatang ?? 0) -
      debt.amountPaidThisCycleSatang,
  );
}

export function daysUntilDue(dueDate: string, today = new Date()): number {
  const [todayYear, todayMonth, todayDay] = getBangkokTodayString(today).split("-").map(Number);
  const start = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const [year, month, day] = dueDate.split("-").map(Number);
  const due = Date.UTC(year, month - 1, day);
  return Math.ceil((due - start) / 86_400_000);
}

export function isOverdue(debt: Debt, today = new Date()): boolean {
  return Boolean(
    debt.dueDate &&
      debt.status === "active" &&
      daysUntilDue(debt.dueDate, today) < 0 &&
      remainingToMinimum(debt) > 0,
  );
}

export function isMinimumPaid(debt: Debt): boolean {
  if (debt.minimumPaymentSatang === undefined) return false;
  return remainingToMinimum(debt) === 0;
}

export function isFullCyclePaid(debt: Debt): boolean {
  if (debt.amountDueSatang === undefined) return false;
  return remainingToFullAmount(debt) === 0;
}

export function debtCycleStatus(
  debt: Debt,
  today = new Date(),
): "cycle_paid" | "minimum_paid" | "overdue" | "due_today" | "due_soon" | "upcoming" {
  if (isFullCyclePaid(debt)) return "cycle_paid";
  if (isMinimumPaid(debt)) return "minimum_paid";
  if (!debt.dueDate) return "upcoming";

  const days = daysUntilDue(debt.dueDate, today);
  if (days < 0) return "overdue";
  if (days === 0) return "due_today";
  if (days <= 7) return "due_soon";
  return "upcoming";
}

export function paymentProgress(debt: Debt): number {
  const target = debt.minimumPaymentSatang ?? debt.amountDueSatang ?? 0;
  if (target <= 0) return 1;
  return Math.min(1, debt.amountPaidThisCycleSatang / target);
}

export function applyDebtPayment(debt: Debt, amountSatang: number): Debt {
  return {
    ...debt,
    amountPaidThisCycleSatang: debt.amountPaidThisCycleSatang + amountSatang,
  };
}

export function isOwnAccountTransfer(
  transaction: Transaction,
  accounts: Account[],
): boolean {
  if (transaction.type !== "transfer") return false;
  const source = accounts.find((account) => account.id === transaction.sourceAccountId);
  const destination = accounts.find(
    (account) => account.id === transaction.destinationAccountId,
  );
  return Boolean(source?.isOwnedByUser && destination?.isOwnedByUser);
}

export function shouldCountAsLivingExpense(transaction: Transaction): boolean {
  return transaction.status === "confirmed" && transaction.type === "expense";
}

export function salaryNetIncomeSatang(input: {
  netIncomeSatang?: number;
  grossIncomeSatang?: number;
}): number {
  return input.netIncomeSatang ?? input.grossIncomeSatang ?? 0;
}

export function deliveryTotalPaidSatang(input: {
  subtotalSatang: number;
  deliveryFeeSatang?: number;
  serviceFeeSatang?: number;
  discountSatang?: number;
}): number {
  return (
    input.subtotalSatang +
    (input.deliveryFeeSatang ?? 0) +
    (input.serviceFeeSatang ?? 0) -
    (input.discountSatang ?? 0)
  );
}

export type HistoricalInsight = {
  id: string;
  message: string;
  type: "info" | "success" | "warning";
};

export function calculateHistoricalInsights(transactions: Transaction[]): HistoricalInsight[] {
  const confirmedTxs = transactions.filter((tx) => tx.status === "confirmed");
  const insights: HistoricalInsight[] = [];

  if (confirmedTxs.length === 0) return insights;

  // 1. Average Delivery Spending
  const deliveryTxs = confirmedTxs.filter((tx) => tx.category === "เดลิเวอรี");
  const deliveryByMonth: Record<string, number> = {};
  deliveryTxs.forEach((tx) => {
    const month = getBangkokMonthOf(tx.occurredAt);
    deliveryByMonth[month] = (deliveryByMonth[month] ?? 0) + tx.amountSatang;
  });
  const deliveryMonths = Object.keys(deliveryByMonth);
  if (deliveryMonths.length >= 2) {
    const totalSatang = Object.values(deliveryByMonth).reduce((sum, amt) => sum + amt, 0);
    const avgSatang = Math.round(totalSatang / deliveryMonths.length);
    insights.push({
      id: "delivery-avg",
      message: `${deliveryMonths.length} เดือนที่ผ่านมา เดลิเวอรีเฉลี่ยเดือนละ ฿${(avgSatang / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      type: "info",
    });
  }

  // 2. Recurring Expenses Estimation
  const expenses = confirmedTxs.filter((tx) => tx.type === "expense");
  const expenseGroups: Record<string, { months: Set<string>; amountSatang: number }> = {};
  expenses.forEach((tx) => {
    const key = tx.merchant || tx.note || "";
    if (!key || key.length < 3) return;
    const month = getBangkokMonthOf(tx.occurredAt);
    if (!expenseGroups[key]) {
      expenseGroups[key] = { months: new Set(), amountSatang: tx.amountSatang };
    }
    expenseGroups[key].months.add(month);
  });

  let recurringTotalSatang = 0;
  Object.entries(expenseGroups).forEach(([_key, group]) => {
    if (group.months.size >= 2) {
      recurringTotalSatang += group.amountSatang;
    }
  });

  if (recurringTotalSatang > 0) {
    insights.push({
      id: "recurring-exp",
      message: `พบค่าใช้จ่ายประจำประมาณ ฿${(recurringTotalSatang / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} ต่อเดือน`,
      type: "info",
    });
  }

  // 3. Debt Payment Consistency
  const debtPayments = confirmedTxs.filter((tx) => tx.type === "debt_payment");
  const debtPaymentMonths = new Set(debtPayments.map((tx) => getBangkokMonthOf(tx.occurredAt)));
  if (debtPaymentMonths.size >= 2) {
    insights.push({
      id: "debt-consistency",
      message: `ชำระหนี้ตรงเวลา ${debtPaymentMonths.size} เดือนติดต่อกัน`,
      type: "success",
    });
  }

  return insights;
}
