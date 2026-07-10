import { notFound } from "next/navigation";
import { DebtPaymentHistoryClient } from "@/features/debts/DebtPaymentHistoryClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listDebtPaymentHistory, listDebts } from "@/lib/data/finance-repository";

export default async function DebtDetailPage({
  params,
}: {
  params: Promise<{ debtId: string }>;
}) {
  const user = await requireUser();
  await requireCompletedOnboarding(user);
  const { debtId } = await params;
  const debts = await listDebts(user.id, true);
  const debt = debts.find((item) => item.id === debtId);
  if (!debt) notFound();
  const payments = await listDebtPaymentHistory(user.id, debtId);
  return <DebtPaymentHistoryClient debt={debt} payments={payments} />;
}
