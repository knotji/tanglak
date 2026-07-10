import { TransactionsClient } from "@/features/transactions/TransactionsClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/data/account-repository";
import { listTransactions } from "@/lib/data/finance-repository";

export default async function TransactionsPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);
  const month = new Date().toISOString().slice(0, 7);
  const [transactions, accounts] = await Promise.all([
    listTransactions(user.id, month),
    listAccounts(user.id),
  ]);

  return <TransactionsClient transactions={transactions} accounts={accounts} monthLabel="เดือนนี้" />;
}
