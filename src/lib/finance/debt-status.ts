import { daysUntilDue, remainingToMinimum } from "@/lib/finance/calculations";
import type { Debt } from "@/types/domain";

/**
 * Display-only debt due status. This is deliberately separate from the
 * persisted `Debt.status` column (active/paid_off/overdue/paused) -- it is
 * never written to the database and never triggers any state transition or
 * auto-close. A debt reaching "จ่ายครบยอดรอบนี้แล้ว" here does NOT mean the
 * debt is paid off; only an explicit user action (markDebtPaidOff) does
 * that. See docs/DEBT_PLANNING_ENGINE.md for the full rationale -- this
 * mirrors the "debt closure always requires explicit confirmation" and
 * "never auto-reduce/auto-close" guardrails from the debt-cycle product
 * rules.
 */
export type DebtDueStatus =
  | "not_yet_due"
  | "due_soon"
  | "due_today"
  | "overdue"
  | "minimum_paid"
  | "cycle_paid_in_full";

export const DEBT_DUE_STATUS_LABEL_TH: Record<DebtDueStatus, string> = {
  not_yet_due: "ยังไม่ถึงกำหนด",
  due_soon: "ใกล้ครบกำหนด",
  due_today: "ครบกำหนดวันนี้",
  overdue: "เกินกำหนด",
  minimum_paid: "จ่ายขั้นต่ำแล้ว",
  cycle_paid_in_full: "จ่ายครบยอดรอบนี้แล้ว",
};

export const DEBT_DUE_SOON_WINDOW_DAYS = 3;

/**
 * Determines a single display status for a debt, combining payment
 * satisfaction (has this cycle's obligation already been met?) with due-
 * date urgency. Payment-satisfaction takes priority over date urgency --
 * once the cycle's full statement amount or minimum has been paid, the
 * status reflects that instead of continuing to warn about a due date that
 * no longer represents outstanding risk for this cycle.
 *
 * Priority order:
 *   1. cycle_paid_in_full -- paidThisCycle >= amountDueSatang (only
 *      evaluated when amountDueSatang is a known, positive figure).
 *   2. minimum_paid -- paidThisCycle >= minimumPaymentSatang (only
 *      evaluated when minimumPaymentSatang is a known, positive figure).
 *   3. overdue -- due date has passed.
 *   4. due_today -- due date is today (Bangkok-relative, via daysUntilDue).
 *   5. due_soon -- due date is within DEBT_DUE_SOON_WINDOW_DAYS days.
 *   6. not_yet_due -- everything else, including debts with no due date.
 */
export function debtDueStatus(debt: Debt, today: Date = new Date()): DebtDueStatus {
  const paid = debt.amountPaidThisCycleSatang;

  if (debt.amountDueSatang !== undefined && debt.amountDueSatang > 0 && paid >= debt.amountDueSatang) {
    return "cycle_paid_in_full";
  }
  if (debt.minimumPaymentSatang !== undefined && debt.minimumPaymentSatang > 0 && paid >= debt.minimumPaymentSatang) {
    return "minimum_paid";
  }

  if (!debt.dueDate) return "not_yet_due";

  const days = daysUntilDue(debt.dueDate, today);
  if (days < 0) return "overdue";
  if (days === 0) return "due_today";
  if (days <= DEBT_DUE_SOON_WINDOW_DAYS) return "due_soon";
  return "not_yet_due";
}

export function debtDueStatusLabel(debt: Debt, today: Date = new Date()): string {
  return DEBT_DUE_STATUS_LABEL_TH[debtDueStatus(debt, today)];
}

/** True when the debt still owes something toward this cycle's minimum. */
export function hasUnmetMinimumThisCycle(debt: Debt): boolean {
  return remainingToMinimum(debt) > 0;
}
