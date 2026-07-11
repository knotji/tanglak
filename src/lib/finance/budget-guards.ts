import {
  MONEY_ERROR_NEGATIVE_TH,
  parseRequiredMoney,
  type MoneyParseResult,
} from "@/lib/finance/money-guards";

/**
 * Budget-specific safe Thai copy. These are deliberately more specific than
 * the generic money-guards messages (which stay generic on purpose, since
 * they're reused across many unrelated features) -- never expose SQL, Zod,
 * or stack details in any of these.
 */
export const BUDGET_ERROR_NEGATIVE_TH = "งบประมาณต้องไม่ติดลบ";
export const INCOME_ERROR_NEGATIVE_TH = "รายรับต่อเดือนต้องไม่ติดลบ";
export const BUDGET_ERROR_DUPLICATE_TH = "มีงบหมวดนี้ในเดือนนี้แล้ว";
export const BUDGET_ERROR_NOT_FOUND_TH = "ไม่พบงบประมาณของเดือนนี้";

/**
 * Parses a category budget amount (baht string or number), rejecting blank,
 * malformed, non-finite, and negative input -- never clamping or dropping
 * the sign. Zero is valid (a category can be deliberately budgeted at ฿0).
 * The malformed-format case keeps money-guards' generic Thai message;
 * only the sign-specific failure is remapped to the budget-specific copy.
 */
export function parseBudgetCategoryAmount(raw: FormDataEntryValue | number | null | undefined): MoneyParseResult {
  const result = parseRequiredMoney(raw, "nonnegative");
  if (!result.ok && result.error === MONEY_ERROR_NEGATIVE_TH) {
    return { ok: false, error: BUDGET_ERROR_NEGATIVE_TH };
  }
  return result;
}

/**
 * Parses expected monthly income the same way, with the income-specific
 * negative-value message.
 */
export function parseMonthlyIncome(raw: FormDataEntryValue | number | null | undefined): MoneyParseResult {
  const result = parseRequiredMoney(raw, "nonnegative");
  if (!result.ok && result.error === MONEY_ERROR_NEGATIVE_TH) {
    return { ok: false, error: INCOME_ERROR_NEGATIVE_TH };
  }
  return result;
}
