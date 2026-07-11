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
  const status = statusForBudget(spentSatang, budgetSatang);

  return (
    <article className="border-b border-border py-3 last:border-b-0">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-foreground">{category}</h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            {Number.isFinite(percentage) ? `${percentage}%` : "ยังไม่ตั้งงบ"} · <MoneyAmount satang={spentSatang} />
          </p>
        </div>
        <BudgetStatusBadge status={status} />
      </div>
      <BudgetProgress spentSatang={spentSatang} budgetSatang={budgetSatang} label={`${category} budget`} className="mt-3" />
    </article>
  );
}
