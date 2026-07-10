import { DebtsClient } from "@/features/debts/DebtsClient";
import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listDebts } from "@/lib/data/finance-repository";
import { timePage } from "@/lib/observability/timing";

export default async function DebtsPage() {
  return timePage("/debts", async () => {
    const user = await requireUser();
    const [, debts] = await Promise.all([
      requireCompletedOnboarding(user),
      listDebts(user.id, true),
    ]);

    return <DebtsClient debts={debts} />;
  });
}
