import { MoneyAmount } from "@/components/MoneyAmount";
import { BudgetStatusBadge } from "./BudgetStatusBadge";
import { statusForBudget } from "./status";

export function calculateBudgetPercentage(spentSatang: number, budgetSatang: number): number {
  if (budgetSatang <= 0) return spentSatang > 0 ? Infinity : 0;
  return Math.round((spentSatang / budgetSatang) * 100);
}

export function BudgetProgress({
  spentSatang,
  budgetSatang,
  label = "งบประมาณ",
  className = "",
}: {
  spentSatang: number;
  budgetSatang: number;
  label?: string;
  className?: string;
}) {
  const percentage = calculateBudgetPercentage(spentSatang, budgetSatang);
  const remaining = budgetSatang - spentSatang;
  const status = statusForBudget(spentSatang, budgetSatang);
  const isNoBudget = budgetSatang <= 0;
  const isOverspent = !isNoBudget && percentage > 100;
  const progressValue = Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : 0;
  const barTone = status === "overspent" ? "bg-overdue" : status === "near_limit" ? "bg-debt" : "bg-income";
  const valueText = isNoBudget
    ? spentSatang > 0
      ? `ยังไม่ตั้งงบ ใช้ไป ${spentSatang} สตางค์`
      : "ยังไม่ตั้งงบ"
    : `${percentage}% ใช้ไป ${spentSatang} จาก ${budgetSatang} สตางค์`;

  return (
    <section className={`space-y-3 ${className}`} aria-label={label}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">{label}</p>
          <p className="mt-1 text-xs text-text-secondary">
            ใช้ไป <MoneyAmount satang={spentSatang} /> จาก <MoneyAmount satang={budgetSatang} />
          </p>
        </div>
        <BudgetStatusBadge status={status} />
      </div>
      <div
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressValue}
        aria-valuetext={valueText}
        className="h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div className={`h-full rounded-full ${barTone}`} style={{ width: `${progressValue}%` }} />
      </div>
      {isOverspent ? (
        <p className="text-xs font-bold text-overdue">
          ใช้เกินงบ {percentage - 100}% (<MoneyAmount satang={Math.abs(remaining)} tone="expense" />)
        </p>
      ) : isNoBudget ? (
        <p className="text-xs font-bold text-text-secondary">
          ยังไม่ตั้งงบสำหรับหมวดนี้{spentSatang > 0 ? " แต่มีการใช้จ่ายแล้ว" : ""}
        </p>
      ) : (
        <p className="text-xs font-medium text-text-secondary">
          คงเหลือ <MoneyAmount satang={Math.max(remaining, 0)} />
        </p>
      )}
    </section>
  );
}
