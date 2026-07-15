import { DebtsClient } from "@/features/debts/DebtsClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listAllTransactions, listDebts } from "@/lib/data/finance-repository";
import { buildDebtPortfolioComparison, filterActiveDebts } from "@/lib/debt/portfolio-strategy";
import { timePage } from "@/lib/observability/timing";
import { recommendFocusDebt } from "@/lib/finance/portfolio-recommendation";

export default async function DebtsPage() {
  return timePage("/debts", async () => {
    const user = await requireUser();
    const [, debts, transactions] = await Promise.all([
      requireCompletedOnboarding(user),
      listDebts(user.id, true),
      listAllTransactions(user.id),
    ]);
    const activeDebts = filterActiveDebts(debts);
    const strategyRecommendation =
      activeDebts.length >= 2 ? recommendFocusDebt(buildDebtPortfolioComparison(activeDebts, 0)) : null;

    return (
      <DebtsClient
        debts={debts}
        transactions={transactions}
        strategyRecommendation={strategyRecommendation}
        activeDebtCount={activeDebts.length}
      />
    );
  });
}
