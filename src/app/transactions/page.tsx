import { TransactionsClient } from "@/features/transactions/TransactionsClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/data/account-repository";
import { listTransactions } from "@/lib/data/finance-repository";
import { timePage } from "@/lib/observability/timing";

export default async function TransactionsPage() {
  return timePage("/transactions", async () => {
    const user = await requireUser();
    const month = new Date().toISOString().slice(0, 7);
    const [, transactions, accounts] = await Promise.all([
      requireCompletedOnboarding(user),
      listTransactions(user.id, month),
      listAccounts(user.id),
    ]);

    return <TransactionsClient transactions={transactions} accounts={accounts} monthLabel="เดือนนี้" />;
  });
}
