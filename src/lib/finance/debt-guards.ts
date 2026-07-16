import {
  MONEY_ERROR_NEGATIVE_TH,
  parseOptionalMoney,
  parseRequiredMoney,
  type MoneyParseResult,
} from "@/lib/finance/money-guards";

/**
 * Debt-specific safe Thai copy. Deliberately more specific than the generic
 * money-guards messages, mirroring the pattern in budget-guards.ts -- never
 * expose SQL, Zod, or stack details in any of these.
 */
export const DEBT_ERROR_OUTSTANDING_NEGATIVE_TH = "ยอดหนี้ต้องไม่ติดลบ";
export const DEBT_ERROR_MINIMUM_NEGATIVE_TH = "ยอดขั้นต่ำต้องไม่ติดลบ";
export const DEBT_ERROR_INTEREST_NEGATIVE_TH = "อัตราดอกเบี้ยต้องไม่ติดลบ";
export const DEBT_ERROR_INTEREST_INVALID_TH = "อัตราดอกเบี้ยไม่ถูกต้อง";
export const DEBT_ERROR_DUE_DATE_INVALID_TH = "วันครบกำหนดไม่ถูกต้อง";
export const DEBT_ERROR_NOT_FOUND_TH = "ไม่พบข้อมูลหนี้";
export const DEBT_ERROR_MINIMUM_ABOVE_OUTSTANDING_TH = "ยอดขั้นต่ำต้องไม่มากกว่ายอดหนี้ทั้งหมด";
export const DEBT_ERROR_UNLINKED_PAYMENT_TH = "กรุณาเลือกหนี้ที่เกี่ยวข้องกับรายการชำระนี้";
export const DEBT_ERROR_NOT_ACTIVE_TH = "หนี้นี้ไม่ได้อยู่ในสถานะที่ชำระได้ (ปิด/พัก/ลบไปแล้ว) จึงบันทึกการชำระเพิ่มไม่ได้";

/**
 * Locked rule: only a debt in `active` or `overdue` status may receive a new
 * payment. An overdue debt is still open (just past its due date), matching
 * `ACTIVE_DEBT_STATUSES` in src/lib/reconciliation/likely-debt-payment.ts,
 * which already treats `overdue` as payable. `paid_off`, `paused`,
 * `deleted`, and any other status are all rejected -- never silently
 * allowed through, never auto-reopened. Mirrors the same check enforced
 * atomically inside the `record_debt_payment` Postgres RPC (see
 * supabase/migrations/202607140004_fix_debt_payment_race_and_status.sql)
 * for the mock-auth code path.
 */
export function assertDebtActiveForPayment(status: string | undefined): void {
  if (status !== "active" && status !== "overdue") {
    throw new Error(DEBT_ERROR_NOT_ACTIVE_TH);
  }
}

/** Annual interest rate is a percentage: 0 through 100, inclusive. */
export const INTEREST_RATE_MIN = 0;
export const INTEREST_RATE_MAX = 100;

export function parseDebtOutstandingBalance(raw: FormDataEntryValue | number | null | undefined): MoneyParseResult {
  const result = parseOptionalMoney(raw, "nonnegative");
  if (!result.ok && result.error === MONEY_ERROR_NEGATIVE_TH) {
    return { ok: false, error: DEBT_ERROR_OUTSTANDING_NEGATIVE_TH };
  }
  return result;
}

export function parseDebtMinimumPayment(raw: FormDataEntryValue | number | null | undefined): MoneyParseResult {
  const result = parseOptionalMoney(raw, "nonnegative");
  if (!result.ok && result.error === MONEY_ERROR_NEGATIVE_TH) {
    return { ok: false, error: DEBT_ERROR_MINIMUM_NEGATIVE_TH };
  }
  return result;
}

export function parseDebtAmountDue(raw: FormDataEntryValue | number | null | undefined): MoneyParseResult {
  const result = parseRequiredMoney(raw, "nonnegative");
  if (!result.ok && result.error === MONEY_ERROR_NEGATIVE_TH) {
    return { ok: false, error: DEBT_ERROR_OUTSTANDING_NEGATIVE_TH };
  }
  return result;
}

export type InterestRateParseResult = { ok: true; rate?: number } | { ok: false; error: string };

/**
 * Parses an optional annual interest rate percentage (e.g. "16.5" for
 * 16.5% per year). Rejects blank-but-present-whitespace, malformed, NaN,
 * Infinity, and out-of-[0,100]-range input -- never clamps, never coerces
 * a negative value to zero or an over-range value to 100. A fully absent
 * value (null/undefined/empty string) is valid and resolves to
 * `rate: undefined` (interest rate is optional -- not every debt type has
 * one).
 */
export function parseInterestRateAnnual(raw: FormDataEntryValue | number | null | undefined): InterestRateParseResult {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: true, rate: undefined };
  }
  const numeric = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(numeric)) {
    return { ok: false, error: DEBT_ERROR_INTEREST_INVALID_TH };
  }
  if (numeric < INTEREST_RATE_MIN) {
    return { ok: false, error: DEBT_ERROR_INTEREST_NEGATIVE_TH };
  }
  if (numeric > INTEREST_RATE_MAX) {
    return { ok: false, error: DEBT_ERROR_INTEREST_INVALID_TH };
  }
  return { ok: true, rate: numeric };
}

/**
 * Last-line-of-defense guard for repository/server-action code paths,
 * mirroring assertMoneySatang's shape. `null`/`undefined` are treated as
 * "not provided" and pass.
 */
export function assertInterestRateAnnual(rate: number | null | undefined): void {
  if (rate === null || rate === undefined) return;
  if (!Number.isFinite(rate)) {
    throw new Error(DEBT_ERROR_INTEREST_INVALID_TH);
  }
  if (rate < INTEREST_RATE_MIN) {
    throw new Error(DEBT_ERROR_INTEREST_NEGATIVE_TH);
  }
  if (rate > INTEREST_RATE_MAX) {
    throw new Error(DEBT_ERROR_INTEREST_INVALID_TH);
  }
}

/**
 * Locked Phase 1 rule: a transaction of type `debt_payment` must always
 * carry an explicit, same-user `debtId` -- never silently downgraded to a
 * different type, never auto-linked from an account number or slip
 * content. Any other transaction type is unaffected (an expense/income/
 * transfer/refund never requires a debtId). Checked against the final
 * merged state (patch + existing row together), same pattern as
 * assertMoneySatang's type+amount check in updateTransaction.
 */
export function assertDebtPaymentLinked(type: string | undefined, debtId: string | null | undefined): void {
  if (type !== "debt_payment") return;
  if (!debtId) {
    throw new Error(DEBT_ERROR_UNLINKED_PAYMENT_TH);
  }
}

/**
 * Locked Phase 1 rule: a debt's minimum payment for the current cycle must
 * never exceed its outstanding balance. Only checked when BOTH values are
 * known (non-null/non-undefined) -- an unset outstanding balance does not
 * constrain the minimum, matching the nullable DB columns. Never clamps
 * either value; the caller must reject and let the user correct their own
 * input.
 */
export function assertMinimumNotAboveOutstanding(
  minimumPaymentSatang: number | null | undefined,
  outstandingBalanceSatang: number | null | undefined,
): void {
  if (minimumPaymentSatang === null || minimumPaymentSatang === undefined) return;
  if (outstandingBalanceSatang === null || outstandingBalanceSatang === undefined) return;
  if (minimumPaymentSatang > outstandingBalanceSatang) {
    throw new Error(DEBT_ERROR_MINIMUM_ABOVE_OUTSTANDING_TH);
  }
}

/**
 * Validates a due-date string is a real calendar date in canonical
 * YYYY-MM-DD form (matching the <input type="date"> the form uses --
 * unambiguous, never locale-dependent DD/MM vs MM/DD). Rejects malformed
 * strings and non-existent calendar dates (e.g. 2026-02-30).
 */
export function isValidDueDate(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return false;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
