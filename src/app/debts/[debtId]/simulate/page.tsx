import { notFound } from "next/navigation";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listDebts } from "@/lib/data/finance-repository";
import { getMonthlyFinanceSnapshot } from "@/lib/finance/monthly-snapshot";
import { getBangkokMonthString } from "@/lib/finance/date";
import { SimulatorClient } from "./SimulatorClient";

export default async function DebtSimulatePage({
  params,
}: {
  params: Promise<{ debtId: string }>;
}) {
  const user = await requireUser();
  await requireCompletedOnboarding(user);
  const { debtId } = await params;

  // Fetch debts
  const debts = await listDebts(user.id, true);
  const debt = debts.find((item) => item.id === debtId);
  if (!debt) notFound();

  // Fetch financial context for current month using canonical snapshot
  const month = getBangkokMonthString();
  const snapshot = await getMonthlyFinanceSnapshot(user.id, month);
  const { totals, budgetSummary, transactions } = snapshot;

  // Exclude payments made to this specific debt from the general debt payments sum
  // to avoid double-counting in simulation cash calculations.
  const thisDebtPaymentsThisMonth = transactions
    .filter((t) => t.status === "confirmed" && t.type === "debt_payment" && t.debtId === debt.id)
    .reduce((sum, t) => sum + t.amountSatang, 0);

  const otherDebtPaymentsThisMonth = Math.max(0, totals.debtPaymentSatang - thisDebtPaymentsThisMonth);
  const generalExpenses = Math.max(0, totals.livingExpenseSatang - totals.refundSatang);

  return (
    <SimulatorClient
      debt={debt}
      plannedIncomeSatang={budgetSummary.expectedIncomeSatang}
      currentMonthSpendingSatang={generalExpenses}
      debtPaymentsThisMonthSatang={otherDebtPaymentsThisMonth}
    />
  );
}
