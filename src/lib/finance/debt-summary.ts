import { getBangkokMonthRange, getDebtCycleWindow } from "@/lib/finance/date";
import { debtDueStatus, DEBT_DUE_SOON_WINDOW_DAYS } from "@/lib/finance/debt-status";
import type { Debt, Transaction } from "@/types/domain";

export type MonthlyDebtSummary = {
  month: string;
  totalOutstandingSatang: number;
  totalDueThisMonthSatang: number;
  totalMinimumThisMonthSatang: number;
  totalPaidThisMonthSatang: number;
  totalRemainingMinimumSatang: number;
  dueSoonDebts: Debt[];
  overdueDebts: Debt[];
};

function isDueWithinMonth(debt: Debt, month: string): boolean {
  if (!debt.dueDate) return false;
  return debt.dueDate.startsWith(month);
}

/**
 * Sums confirmed debt_payment transactions for one debt within its own
 * cycle window (or, for debts with no cycle dates set, the current
 * Bangkok calendar month) -- never across the debt's entire lifetime, and
 * never shared/double-counted across debts (each transaction carries
 * exactly one `debtId`, so summing per-debt and then across debts cannot
 * double-count a single payment).
 */
function paidWithinCycle(debt: Debt, transactions: Transaction[], month: string): number {
  const window = debt.cycleStartDate && debt.cycleEndDate
    ? getDebtCycleWindow(debt)
    : { ...getBangkokMonthRange(month), isFallback: true };

  // Compare as instants (epoch milliseconds), never as raw ISO strings --
  // two different-but-equivalent timestamp representations of the same
  // instant (e.g. a "Z" suffix vs an explicit "+07:00" offset) can sort
  // differently under lexical string comparison even though the underlying
  // instant is identical or on the correct side of the boundary. See F-007
  // in docs/SLIP_DEBT_IMPLEMENTATION_FINDINGS.md. Cycle start is inclusive,
  // cycle end is exclusive, matching window.startInstant/endExclusiveInstant.
  const startMs = new Date(window.startInstant).getTime();
  const endExclusiveMs = new Date(window.endExclusiveInstant).getTime();

  return transactions
    .filter((transaction) => transaction.debtId === debt.id)
    .filter((transaction) => transaction.status === "confirmed")
    .filter((transaction) => transaction.type === "debt_payment")
    .filter((transaction) => {
      const occurredMs = new Date(transaction.occurredAt).getTime();
      return occurredMs >= startMs && occurredMs < endExclusiveMs;
    })
    .reduce((sum, transaction) => sum + transaction.amountSatang, 0);
}

/**
 * Builds the current-month debt obligation summary.
 *
 * Formulas (see docs/DEBT_PLANNING_ENGINE.md for the full rationale):
 *   - หนี้ทั้งหมด: sum of outstandingBalanceSatang across all debts passed
 *     in (callers should pass only active debts).
 *   - ต้องจ่ายเดือนนี้: sum of amountDueSatang for debts whose dueDate falls
 *     within `month`.
 *   - ขั้นต่ำรวม: sum of minimumPaymentSatang for debts whose dueDate falls
 *     within `month`.
 *   - จ่ายแล้วเดือนนี้: sum, per debt, of confirmed debt_payment
 *     transactions within that debt's own cycle window (falling back to
 *     the calendar month when no cycle dates are set) -- cycle-scoped, not
 *     a blanket "transactions dated this calendar month" query, so a
 *     payment made just after a cycle boundary is attributed correctly.
 *   - เหลือขั้นต่ำ: sum of max(0, minimumPaymentSatang - paidThisCycle)
 *     across debts due within `month`. Only ever computed from
 *     `minimumPaymentSatang` and this function's own cycle-scoped paid
 *     total -- this never reads or writes `outstandingBalanceSatang`, so a
 *     payment recorded here can never appear to reduce total outstanding.
 *
 * This function is read-only and side-effect free: it never persists
 * anything, never changes a debt's status, and is safe to call on every
 * page render.
 */
export function buildMonthlyDebtSummary(
  debts: Debt[],
  transactions: Transaction[],
  month: string,
): MonthlyDebtSummary {
  const totalOutstandingSatang = debts.reduce((sum, debt) => sum + (debt.outstandingBalanceSatang ?? 0), 0);

  const dueThisMonth = debts.filter((debt) => isDueWithinMonth(debt, month));

  const totalDueThisMonthSatang = dueThisMonth.reduce((sum, debt) => sum + (debt.amountDueSatang ?? 0), 0);
  const totalMinimumThisMonthSatang = dueThisMonth.reduce((sum, debt) => sum + (debt.minimumPaymentSatang ?? 0), 0);

  let totalPaidThisMonthSatang = 0;
  let totalRemainingMinimumSatang = 0;
  for (const debt of dueThisMonth) {
    const paid = paidWithinCycle(debt, transactions, month);
    totalPaidThisMonthSatang += paid;
    const minimum = debt.minimumPaymentSatang ?? 0;
    totalRemainingMinimumSatang += Math.max(0, minimum - paid);
  }

  const dueSoonDebts = debts.filter((debt) => {
    const status = debtDueStatus(debt);
    return status === "due_soon" || status === "due_today";
  });
  const overdueDebts = debts.filter((debt) => debtDueStatus(debt) === "overdue");

  return {
    month,
    totalOutstandingSatang,
    totalDueThisMonthSatang,
    totalMinimumThisMonthSatang,
    totalPaidThisMonthSatang,
    totalRemainingMinimumSatang,
    dueSoonDebts,
    overdueDebts,
  };
}

export { DEBT_DUE_SOON_WINDOW_DAYS };
