import { TransactionsClient } from "@/features/transactions/TransactionsClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listTransactions } from "@/lib/data/finance-repository";

export default async function TransactionsPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);
  const month = new Date().toISOString().slice(0, 7);
  const transactions = await listTransactions(user.id, month);

  return <TransactionsClient transactions={transactions} monthLabel="เดือนนี้" />;
}
