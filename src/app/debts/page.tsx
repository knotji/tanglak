import { DebtsClient } from "@/features/debts/DebtsClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listDebts } from "@/lib/data/finance-repository";

export default async function DebtsPage() {
  const user = await requireUser();
  await requireCompletedOnboarding(user);
  const debts = await listDebts(user.id, true);

  return <DebtsClient debts={debts} />;
}
