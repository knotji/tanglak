import { requireCompletedOnboarding } from "@/lib/auth/onboarding";
import { requireUser } from "@/lib/auth/session";
import { listDebts } from "@/lib/data/finance-repository";
import { filterActiveDebts } from "@/lib/debt/portfolio-strategy";
import { timePage } from "@/lib/observability/timing";
import { StrategyClient } from "./StrategyClient";

export default async function DebtStrategyPage() {
  return timePage("/debts/strategy", async () => {
    const user = await requireUser();
    await requireCompletedOnboarding(user);
    const debts = await listDebts(user.id, true);
    const activeDebts = filterActiveDebts(debts);

    return <StrategyClient debts={activeDebts} />;
  });
}
