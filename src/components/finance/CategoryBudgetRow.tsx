import { MoneyAmount } from "@/components/MoneyAmount";
import { BudgetProgress, calculateBudgetPercentage } from "./BudgetProgress";
import { BudgetStatusBadge } from "./BudgetStatusBadge";
import { statusForBudget } from "./status";

export function CategoryBudgetRow({
  category,
  spentSatang,
  budgetSatang,
}: {
  category: string;
  spentSatang: number;
  budgetSatang: number;
}) {
  const percentage = calculateBudgetPercentage(spentSatang, budgetSatang);
  // Canonical status from the budget domain layer (via statusForBudget) --
  // a category with no positive budget is always "no_budget", never
  // "overspent" (spending against it is unbudgeted spending, not
  // overspending). percentage is only ever Infinity when status is
  // "no_budget", so the finite branch below always applies otherwise.
  const status = statusForBudget(spentSatang, budgetSatang);
  const percentLabel = status === "no_budget" ? "ยังไม่ได้ตั้งงบ" : `${percentage}%`;

  return (
    <article className="border-b border-border py-3 last:border-b-0">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-foreground">{category}</h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            {percentLabel} · <MoneyAmount satang={spentSatang} />
          </p>
        </div>
        <BudgetStatusBadge status={status} />
      </div>
      <BudgetProgress spentSatang={spentSatang} budgetSatang={budgetSatang} label={`${category} budget`} className="mt-3" />
    </article>
  );
}
