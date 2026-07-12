import { BudgetClient } from "@/features/budget/BudgetClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { getMonthlyBudget, listBudgetCategories } from "@/lib/data/finance-repository";
import { getMonthlyFinanceSnapshot } from "@/lib/finance/monthly-snapshot";
import {
  formatBangkokMonthLabel,
  getBangkokMonthString,
  resolveBangkokMonthQuery,
  shiftMonth,
} from "@/lib/finance/date";
import { timePage } from "@/lib/observability/timing";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string | string[] }>;
}) {
  return timePage("/budget", async () => {
    const user = await requireUser();
    const resolvedSearchParams = await searchParams;
    const currentMonth = getBangkokMonthString();
    const selectedMonth = resolveBangkokMonthQuery(resolvedSearchParams?.month);
    const previousMonth = shiftMonth(selectedMonth, -1);

    // Canonical month-scoped snapshot (see monthly-snapshot.ts) -- this
    // page used to fetch listAllTransactions(user.id) (every transaction,
    // all time, unfiltered) and rely entirely on buildBudgetSummary's own
    // internal month filter, which used the same naive
    // `occurredAt.startsWith(month)` check now fixed to be Bangkok-aware.
    // Fetching only this month's transactions up front is both correct and
    // avoids transferring/holding a user's entire transaction history to
    // build one month's budget view.
    const [, snapshot, previousMonthBudget] = await Promise.all([
      requireCompletedOnboarding(user),
      getMonthlyFinanceSnapshot(user.id, selectedMonth),
      getMonthlyBudget(user.id, previousMonth),
    ]);
    const { monthlyBudget: budget, budgetSummary: summary } = snapshot;
    const previousMonthCategories = previousMonthBudget
      ? await listBudgetCategories(user.id, previousMonthBudget.id)
      : [];

    return (
      <BudgetClient
        summary={summary}
        monthlyBudgetId={budget?.id}
        selectedMonth={selectedMonth}
        currentMonth={currentMonth}
        previousMonth={previousMonth}
        monthLabel={formatBangkokMonthLabel(selectedMonth)}
        canCopyPreviousMonth={previousMonthBudget !== null}
        previousMonthCategoryPreview={previousMonthCategories.map((category) => ({
          label: category.label,
          amountSatang: category.amountSatang,
        }))}
      />
    );
  });
}
