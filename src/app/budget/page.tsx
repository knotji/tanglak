import { BudgetClient } from "@/features/budget/BudgetClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { getMonthlyBudget, listBudgetCategories, listAllTransactions } from "@/lib/data/finance-repository";
import { buildBudgetSummary } from "@/lib/finance/budget-calculations";
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

    const [, budget, transactions] = await Promise.all([
      requireCompletedOnboarding(user),
      getMonthlyBudget(user.id, selectedMonth),
      listAllTransactions(user.id),
    ]);

    const [categories, previousMonthBudget] = await Promise.all([
      budget ? listBudgetCategories(user.id, budget.id) : Promise.resolve([]),
      getMonthlyBudget(user.id, previousMonth),
    ]);

    const summary = buildBudgetSummary(selectedMonth, budget, categories, transactions);

    return (
      <BudgetClient
        summary={summary}
        monthlyBudgetId={budget?.id}
        selectedMonth={selectedMonth}
        currentMonth={currentMonth}
        previousMonth={previousMonth}
        monthLabel={formatBangkokMonthLabel(selectedMonth)}
        canCopyPreviousMonth={previousMonthBudget !== null}
      />
    );
  });
}
