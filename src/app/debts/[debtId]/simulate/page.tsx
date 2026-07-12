import { notFound } from "next/navigation";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import {
  listDebts,
  getMonthlyBudget,
  listTransactions,
  listBudgetCategories,
} from "@/lib/data/finance-repository";
import { buildBudgetSummary } from "@/lib/finance/budget-calculations";
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

  // Fetch financial context for current month
  const month = getBangkokMonthString();
  const [monthlyBudget, transactions] = await Promise.all([
    getMonthlyBudget(user.id, month),
    listTransactions(user.id, month),
  ]);

  const categories = monthlyBudget ? await listBudgetCategories(user.id, monthlyBudget.id) : [];
  const budgetSummary = buildBudgetSummary(month, monthlyBudget, categories, transactions);

  // Separate debt payments and general expenses
  const debtPaymentsAlreadyMade = transactions
    .filter((t) => t.status === "confirmed" && t.type === "debt_payment")
    .reduce((sum, t) => sum + t.amountSatang, 0);

  const generalExpenses = transactions
    .filter((t) => t.status === "confirmed" && (t.type === "expense" || t.type === "refund"))
    .reduce((sum, t) => sum + (t.type === "expense" ? t.amountSatang : -t.amountSatang), 0);

  return (
    <SimulatorClient
      debt={debt}
      plannedIncomeSatang={budgetSummary.expectedIncomeSatang}
      currentMonthSpendingSatang={Math.max(0, generalExpenses)}
      debtPaymentsThisMonthSatang={debtPaymentsAlreadyMade}
    />
  );
}
