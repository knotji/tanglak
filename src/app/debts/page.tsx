import { DebtsClient } from "@/features/debts/DebtsClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listAllTransactions, listDebts } from "@/lib/data/finance-repository";
import { timePage } from "@/lib/observability/timing";

export default async function DebtsPage() {
  return timePage("/debts", async () => {
    const user = await requireUser();
    const [, debts, transactions] = await Promise.all([
      requireCompletedOnboarding(user),
      listDebts(user.id, true),
      listAllTransactions(user.id),
    ]);

    return <DebtsClient debts={debts} transactions={transactions} />;
  });
}
