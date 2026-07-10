import type { Account, Debt, Transaction } from "@/types/domain";

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
    .filter((transaction) => transaction.occurredAt.startsWith(month))
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
  const start = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
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
  return remainingToMinimum(debt) === 0;
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
    const month = tx.occurredAt.slice(0, 7);
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
    const month = tx.occurredAt.slice(0, 7);
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
  const debtPaymentMonths = new Set(debtPayments.map((tx) => tx.occurredAt.slice(0, 7)));
  if (debtPaymentMonths.size >= 2) {
    insights.push({
      id: "debt-consistency",
      message: `ชำระหนี้ตรงเวลา ${debtPaymentMonths.size} เดือนติดต่อกัน`,
      type: "success",
    });
  }

  return insights;
}
