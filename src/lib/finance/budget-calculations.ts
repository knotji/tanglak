import type { BudgetCategory, MonthlyBudget, Transaction } from "@/types/domain";
import { getBangkokMonthOf } from "./date";
import { resolveCategoryFromLegacyLabel } from "./categories";

/**
 * Status thresholds for a budget category's usage ratio (spent / budgeted).
 * - healthy: usage below 80%
 * - near_limit: usage from 80% up to and including 100%
 * - overspent: usage strictly above 100%, and only possible against a
 *   positive budget
 * - no_budget: no positive budget configured for the category, regardless
 *   of whether anything was spent against it -- see `statusForCategory`
 *   below. Spending in a "no_budget" category is "unbudgeted spending", not
 *   overspending: there is no allocation to exceed.
 */
export const BUDGET_NEAR_LIMIT_THRESHOLD = 0.8;
export const BUDGET_OVERSPENT_THRESHOLD = 1;

export type BudgetStatus = "healthy" | "near_limit" | "overspent" | "no_budget";

/**
 * Transaction types that can contribute to a category's "actual spend", per
 * the documented inclusion rules (see docs/MONTHLY_BUDGET_ENGINE.md):
 *   - expense: full amount counts as spend.
 *   - debt_payment: full amount counts as spend (explicitly required so a
 *     debt-payment budget category, e.g. "หนี้สิน", can be tracked).
 *   - refund: offsets (reduces) spend in the same category label, modeling a
 *     partial/full refund of a prior expense. A category's spend is floored
 *     at 0 -- refunds can never make a category's spend negative.
 * income and transfer are never included, regardless of category label.
 */
function transactionSpendDelta(transaction: Transaction): number {
  switch (transaction.type) {
    case "expense":
    case "debt_payment":
      return transaction.amountSatang;
    case "refund":
      return -transaction.amountSatang;
    default:
      return 0;
  }
}

function isBudgetRelevant(transaction: Transaction, month: string): boolean {
  // Only confirmed transactions count. This naturally excludes rolled-back
  // history-import transactions (rollback deletes the row entirely -- see
  // docs/HISTORY_IMPORT_IDEMPOTENCY.md) and anything still draft/needs_review/rejected.
  if (transaction.status !== "confirmed") return false;
  // Bangkok-local month comparison, not a naive string prefix -- Supabase
  // returns occurredAt in UTC, so a prefix check silently drops/misfiles
  // transactions near the Bangkok midnight boundary (see getBangkokMonthOf).
  if (getBangkokMonthOf(transaction.occurredAt) !== month) return false;
  return (
    transaction.type === "expense" ||
    transaction.type === "debt_payment" ||
    transaction.type === "refund"
  );
}

export type CategorySpendTotals = {
  /** category label -> spent satang, always >= 0 */
  byLabel: Record<string, number>;
  /** spend from confirmed expense/debt_payment/refund transactions with no category label */
  uncategorizedSatang: number;
};

/**
 * Aggregates confirmed transactions for a month into per-category spend
 * totals. Category matching is by exact `transaction.category` (i.e.
 * `category_label`) string equality against `budget_categories.label` --
 * this app does not join transactions to `categories.id` anywhere (see
 * docs/MONTHLY_BUDGET_ENGINE.md for why), so budgeting follows the same
 * free-text convention already used by the overview page. Before matching,
 * a transaction's raw category is normalized through the canonical catalog
 * (src/lib/finance/categories.ts) when it's a recognized legacy label/alias
 * (e.g. "อาหาร" -> "อาหารและเครื่องดื่ม") -- otherwise a legacy-labeled
 * transaction and its canonical-labeled budget category would appear as
 * two separate, duplicate-looking category rows instead of one.
 * Genuinely unrecognized labels (not in the catalog at all) pass through
 * unchanged so no historical data is silently dropped.
 */
export function calculateCategorySpend(transactions: Transaction[], month: string): CategorySpendTotals {
  const raw: Record<string, number> = {};
  let uncategorizedSatang = 0;

  for (const transaction of transactions) {
    if (!isBudgetRelevant(transaction, month)) continue;
    const delta = transactionSpendDelta(transaction);
    const rawLabel = transaction.category?.trim();
    if (!rawLabel) {
      uncategorizedSatang += delta;
      continue;
    }
    const label = resolveCategoryFromLegacyLabel(rawLabel)?.label ?? rawLabel;
    raw[label] = (raw[label] ?? 0) + delta;
  }

  const byLabel: Record<string, number> = {};
  for (const [label, amount] of Object.entries(raw)) {
    byLabel[label] = Math.max(0, amount);
  }

  return { byLabel, uncategorizedSatang: Math.max(0, uncategorizedSatang) };
}

export type CategorySummary = {
  label: string;
  budgetCategoryId?: string;
  budgetedSatang: number;
  spentSatang: number;
  remainingSatang: number;
  /** spent / budgeted, or null when budgeted is 0 (percentage is not meaningful) */
  usagePercent: number | null;
  status: BudgetStatus;
  /** spent - budgeted, only when status is "overspent". Always >= 0, otherwise 0. */
  overspentSatang: number;
  /** spent, only when this category has no positive budget configured. Always >= 0, otherwise 0. */
  unbudgetedSpentSatang: number;
};

/**
 * Determines a category's status from its budgeted and spent amounts.
 *
 * A category with no positive budget configured is always "no_budget" --
 * never "healthy" (nothing was allocated, so "healthy" would be
 * misleading) and never "overspent" (there is no positive allocation to
 * exceed; spending here is "unbudgeted spending", a distinct concept from
 * overspending -- see `unbudgetedSpentSatang` on `CategorySummary`). A
 * positive-budget category with zero spend is "healthy" at 0% usage --
 * this is how an "unused" category (budgeted but not yet touched this
 * month) is represented.
 */
export function statusForCategory(budgetedSatang: number, spentSatang: number): BudgetStatus {
  if (budgetedSatang <= 0) {
    return "no_budget";
  }
  const ratio = spentSatang / budgetedSatang;
  if (ratio > BUDGET_OVERSPENT_THRESHOLD) return "overspent";
  if (ratio >= BUDGET_NEAR_LIMIT_THRESHOLD) return "near_limit";
  return "healthy";
}

export function summarizeCategory(
  label: string,
  budgetedSatang: number,
  spentSatang: number,
  budgetCategoryId?: string,
): CategorySummary {
  const remainingSatang = budgetedSatang - spentSatang;
  const usagePercent = budgetedSatang > 0 ? spentSatang / budgetedSatang : null;
  const status = statusForCategory(budgetedSatang, spentSatang);
  // overspentSatang: only meaningful above a positive budget that was
  // exceeded. unbudgetedSpentSatang: spend in a category with no positive
  // budget configured. Exactly one of these is ever positive at a time.
  const overspentSatang = status === "overspent" ? spentSatang - budgetedSatang : 0;
  const unbudgetedSpentSatang = budgetedSatang <= 0 ? spentSatang : 0;
  return {
    label,
    budgetCategoryId,
    budgetedSatang,
    spentSatang,
    remainingSatang,
    usagePercent,
    status,
    overspentSatang,
    unbudgetedSpentSatang,
  };
}

export type BudgetSummary = {
  month: string;
  hasBudget: boolean;
  expectedIncomeSatang: number;
  plannedTotalSatang: number;
  spentTotalSatang: number;
  remainingTotalSatang: number;
  /** expectedIncome - plannedTotal. Negative means categories are over-allocated relative to income. */
  unallocatedIncomeSatang: number;
  /** sum of (spent - budgeted) across categories with a positive budget that was exceeded, always >= 0. Never includes no-budget categories. */
  overspentTotalSatang: number;
  /** sum of spend in categories with no positive budget configured, always >= 0. Distinct from overspentTotalSatang. */
  unbudgetedSpentTotalSatang: number;
  uncategorizedSpentSatang: number;
  categories: CategorySummary[];
  usagePercent: number | null;
  status: BudgetStatus;
};

/**
 * Builds the full reusable budget summary for a month from a monthly budget
 * row (or null, if the user hasn't created one for this month yet), its
 * category rows, and the user's confirmed transactions (any month range --
 * this function filters to `month` itself).
 */
export function buildBudgetSummary(
  month: string,
  budget: MonthlyBudget | null,
  categories: BudgetCategory[],
  transactions: Transaction[],
): BudgetSummary {
  const spend = calculateCategorySpend(transactions, month);

  // Budget category rows are normalized to their canonical catalog label
  // too (not just transaction categories -- see calculateCategorySpend),
  // so a legacy-labeled budget row (e.g. "อาหาร", created before the
  // catalog existed) still matches spend bucketed under the canonical
  // "อาหารและเครื่องดื่ม" label instead of silently showing 0 spent.
  const categorySummaries: CategorySummary[] = categories.map((category) => {
    const canonicalLabel = resolveCategoryFromLegacyLabel(category.label)?.label ?? category.label;
    return summarizeCategory(canonicalLabel, category.amountSatang, spend.byLabel[canonicalLabel] ?? 0, category.id);
  });

  // Include spend for any category that has transactions but no budget row
  // (a "category without a budget") so totals and the UI can surface it.
  const budgetedLabels = new Set(categorySummaries.map((category) => category.label));
  for (const [label, spentSatang] of Object.entries(spend.byLabel)) {
    if (budgetedLabels.has(label)) continue;
    categorySummaries.push(summarizeCategory(label, 0, spentSatang));
  }

  // Priority order for display (Issue 3): categories with spending and a
  // budget first, then categories with spending but no budget (these must
  // never be hidden just because no one configured a budget for them
  // yet), then configured-but-unused categories, alphabetical within each
  // tier. This is the one canonical order -- every page that lists
  // categories (Budget, and any future consumer) gets it from here rather
  // than re-deriving its own.
  function priority(category: CategorySummary): number {
    if (category.spentSatang > 0 && category.budgetedSatang > 0) return 0;
    if (category.spentSatang > 0) return 1;
    return 2;
  }
  categorySummaries.sort((a, b) => {
    const priorityDelta = priority(a) - priority(b);
    if (priorityDelta !== 0) return priorityDelta;
    return a.label.localeCompare(b.label, "th");
  });

  const plannedTotalSatang = categories.reduce((sum, category) => sum + category.amountSatang, 0);
  const categorySpentTotal = categorySummaries.reduce((sum, category) => sum + category.spentSatang, 0);
  const spentTotalSatang = categorySpentTotal + spend.uncategorizedSatang;
  // Only categories with a positive budget that was actually exceeded
  // contribute to overspentTotalSatang -- a category with no positive
  // budget can never be "overspent" (see statusForCategory), so its spend
  // is unbudgeted spending instead, tracked separately below.
  const overspentTotalSatang = categorySummaries.reduce((sum, category) => sum + category.overspentSatang, 0);
  const unbudgetedSpentTotalSatang = categorySummaries.reduce(
    (sum, category) => sum + category.unbudgetedSpentSatang,
    0,
  );
  const expectedIncomeSatang = budget?.incomeSatang ?? 0;

  return {
    month,
    hasBudget: budget !== null,
    expectedIncomeSatang,
    plannedTotalSatang,
    spentTotalSatang,
    remainingTotalSatang: plannedTotalSatang - spentTotalSatang,
    unallocatedIncomeSatang: expectedIncomeSatang - plannedTotalSatang,
    overspentTotalSatang,
    unbudgetedSpentTotalSatang,
    uncategorizedSpentSatang: spend.uncategorizedSatang,
    categories: categorySummaries,
    usagePercent: plannedTotalSatang > 0 ? spentTotalSatang / plannedTotalSatang : null,
    status: statusForCategory(plannedTotalSatang, spentTotalSatang),
  };
}
