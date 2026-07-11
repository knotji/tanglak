import { TransactionsClient } from "@/features/transactions/TransactionsClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listAccounts } from "@/lib/data/account-repository";
import { listTransactions } from "@/lib/data/finance-repository";
import {
  formatBangkokMonthLabel,
  getBangkokMonthString,
  resolveBangkokMonthQuery,
} from "@/lib/finance/date";
import { timePage } from "@/lib/observability/timing";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string | string[]; importBatchId?: string | string[] }>;
}) {
  return timePage("/transactions", async () => {
    const user = await requireUser();
    const resolvedSearchParams = await searchParams;
    const currentMonth = getBangkokMonthString();
    const selectedMonth = resolveBangkokMonthQuery(resolvedSearchParams?.month);
    const importBatchId =
      typeof resolvedSearchParams?.importBatchId === "string" ? resolvedSearchParams.importBatchId : undefined;

    const [, transactions, accounts] = await Promise.all([
      requireCompletedOnboarding(user),
      listTransactions(user.id, selectedMonth),
      listAccounts(user.id),
    ]);

    return (
      <TransactionsClient
        transactions={transactions}
        accounts={accounts}
        selectedMonth={selectedMonth}
        currentMonth={currentMonth}
        monthLabel={formatBangkokMonthLabel(selectedMonth)}
        importContext={Boolean(importBatchId)}
      />
    );
  });
}
